/*
 * Copyright (C) 2010-2020 Ole André Vadla Ravnås <oleavr@nowsecure.com>
 * Copyright (C) 2013 Karl Trygve Kalleberg <karltk@boblycat.org>
 *
 * Licence: wxWindows Library Licence, Version 3.1
 */

#include "fixture.h"

#define ANY_LINE_NUMBER -1
#define MESSAGE_DEFAULT_TIMEOUT_MSEC 500

#define TESTCASE(NAME)                                                        \
    void test_ ## NAME (TestFixture * fixture, gconstpointer data)
#define TESTENTRY(NAME)                                                       \
    G_STMT_START                                                              \
    {                                                                         \
      extern void test_ ##NAME (TestFixture * fixture, gconstpointer data);   \
      const gchar * backend_name;                                             \
      gchar * path;                                                           \
                                                                              \
      backend_name = g_type_name (G_TYPE_FROM_INSTANCE (fixture_data));       \
                                                                              \
      path = g_strconcat ("/" SUITE "/",                                      \
          group, (*group != '\0') ? "/" : "",                                 \
          #NAME "#",                                                          \
          strcmp (backend_name, "GumQuickScriptBackend") == 0 ? "QJS" : "V8", \
          NULL);                                                              \
                                                                              \
      g_test_add (path,                                                       \
          TestFixture,                                                        \
          fixture_data,                                                       \
          test_fixture_setup,                                                 \
          test_ ##NAME,                                                       \
          test_fixture_teardown);                                             \
                                                                              \
      g_free (path);                                                          \
    }                                                                         \
    G_STMT_END;

#define COMPILE_AND_LOAD_SCRIPT(SOURCE, ...) \
    test_fixture_compile_and_load_script (fixture, SOURCE, \
    ## __VA_ARGS__)
#define UNLOAD_SCRIPT() \
    gum_script_unload_sync (fixture->script, NULL); \
    g_object_unref (fixture->script); \
    fixture->script = NULL;
#define POST_MESSAGE(MSG) \
    gum_script_post (fixture->script, MSG, NULL)
#define EXPECT_NO_MESSAGES() \
    g_assert (test_fixture_try_pop_message (fixture, 1) == NULL)
#define EXPECT_SEND_MESSAGE_WITH(PAYLOAD, ...) \
    test_fixture_expect_send_message_with (fixture, PAYLOAD, \
    ## __VA_ARGS__)
#define EXPECT_SEND_MESSAGE_WITH_PREFIX(PREFIX, ...) \
    test_fixture_expect_send_message_with_prefix (fixture, PREFIX, \
    ## __VA_ARGS__)
#define EXPECT_SEND_MESSAGE_WITH_PAYLOAD_AND_DATA(PAYLOAD, DATA) \
    test_fixture_expect_send_message_with_payload_and_data (fixture, \
        PAYLOAD, DATA)
#define EXPECT_ERROR_MESSAGE_WITH(LINE_NUMBER, DESC) \
    test_fixture_expect_error_message_with (fixture, LINE_NUMBER, DESC)
#define EXPECT_LOG_MESSAGE_WITH(LEVEL, PAYLOAD, ...) \
    test_fixture_expect_log_message_with (fixture, LEVEL, PAYLOAD, \
    ## __VA_ARGS__)
#define PUSH_TIMEOUT(value) test_fixture_push_timeout (fixture, value)
#define POP_TIMEOUT() test_fixture_pop_timeout (fixture)

#define GUM_PTR_CONST "ptr(\"0x%" G_GSIZE_MODIFIER "x\")"

typedef struct _TestFixture TestFixture;
typedef struct _TestMessageItem TestMessageItem;

struct _TestFixture
{
  GumScriptBackend * backend;
  GumScript * script;
  GMainLoop * loop;
  GMainContext * context;
  GQueue messages;
  GQueue timeouts;
};

struct _TestMessageItem
{
  gchar * message;
  gchar * data;
  GBytes * raw_data;
};

static void test_message_item_free (TestMessageItem * item);
static gboolean test_fixture_try_handle_log_message (const gchar * raw_message);
static TestMessageItem * test_fixture_try_pop_message (TestFixture * fixture,
    guint timeout);
static gboolean test_fixture_stop_loop (TestFixture * fixture);
static void test_fixture_expect_send_message_with_prefix (TestFixture * fixture,
    const gchar * prefix_template, ...);
static void test_fixture_expect_send_message_with_payload_and_data (
    TestFixture * fixture, const gchar * payload, const gchar * data);
static void test_fixture_expect_error_message_with (TestFixture * fixture,
    gint line_number, const gchar * description);
static void test_fixture_expect_log_message_with (TestFixture * fixture,
    const gchar * level, const gchar * payload_template, ...);
static void test_fixture_push_timeout (TestFixture * fixture, guint timeout);
static void test_fixture_pop_timeout (TestFixture * fixture);

extern gchar * frida_swift_bundle;
extern guint num_tests_run;

static void
test_fixture_setup (TestFixture * fixture,
                    gconstpointer data)
{
  (void) test_fixture_expect_send_message_with_prefix;
  (void) test_fixture_expect_send_message_with_payload_and_data;
  (void) test_fixture_expect_error_message_with;
  (void) test_fixture_expect_log_message_with;
  (void) test_fixture_pop_timeout;

  fixture->backend = (GumScriptBackend *) data;
  fixture->context = g_main_context_ref_thread_default ();
  fixture->loop = g_main_loop_new (fixture->context, FALSE);
  g_queue_init (&fixture->messages);
  g_queue_init (&fixture->timeouts);

  test_fixture_push_timeout (fixture, MESSAGE_DEFAULT_TIMEOUT_MSEC);
}

static void
test_fixture_teardown (TestFixture * fixture,
                       gconstpointer data)
{
  TestMessageItem * item;

  if (fixture->script != NULL)
  {
    gum_script_unload_sync (fixture->script, NULL);
    g_object_unref (fixture->script);
  }

  while (g_main_context_pending (fixture->context))
    g_main_context_iteration (fixture->context, FALSE);

  while ((item = test_fixture_try_pop_message (fixture, 1)) != NULL)
  {
    test_message_item_free (item);
  }

  g_queue_clear (&fixture->timeouts);

  g_main_loop_unref (fixture->loop);
  g_main_context_unref (fixture->context);

  num_tests_run++;
}

static void
test_message_item_free (TestMessageItem * item)
{
  g_free (item->message);
  g_free (item->data);
  g_bytes_unref (item->raw_data);
  g_slice_free (TestMessageItem, item);
}

static void
test_fixture_store_message (const gchar * message,
                            GBytes * data,
                            gpointer user_data)
{
  TestFixture * self = (TestFixture *) user_data;
  TestMessageItem * item;

  if (test_fixture_try_handle_log_message (message))
    return;

  item = g_slice_new (TestMessageItem);
  item->message = g_strdup (message);

  if (data != NULL)
  {
    const guint8 * data_elements;
    gsize data_size, i;
    GString * s;

    data_elements = g_bytes_get_data (data, &data_size);

    s = g_string_sized_new (3 * data_size);
    for (i = 0; i != data_size; i++)
    {
      if (i != 0)
        g_string_append_c (s, ' ');
      g_string_append_printf (s, "%02x", (int) data_elements[i]);
    }

    item->data = g_string_free (s, FALSE);
    item->raw_data = g_bytes_ref (data);
  }
  else
  {
    item->data = NULL;
    item->raw_data = NULL;
  }

  g_queue_push_tail (&self->messages, item);
  g_main_loop_quit (self->loop);
}

static gboolean
test_fixture_try_handle_log_message (const gchar * raw_message)
{
  gboolean handled = FALSE;
  JsonNode * message;
  JsonReader * reader;
  const gchar * text;
  const gchar * level;
  guint color;

  message = json_from_string (raw_message, NULL);
  reader = json_reader_new (message);
  json_node_unref (message);

  json_reader_read_member (reader, "type");
  if (strcmp (json_reader_get_string_value (reader), "log") != 0)
    goto beach;
  json_reader_end_member (reader);

  json_reader_read_member (reader, "payload");
  text = json_reader_get_string_value (reader);
  json_reader_end_member (reader);

  json_reader_read_member (reader, "level");
  level = json_reader_get_string_value (reader);
  json_reader_end_member (reader);
  if (strcmp (level, "info") == 0)
    color = 36;
  else if (strcmp (level, "warning") == 0)
    color = 33;
  else if (strcmp (level, "error") == 0)
    color = 31;
  else
    g_assert_not_reached ();

  g_printerr (
      "\033[0;%um"
      "%s"
      "\033[0m"
      "\n",
      color, text);

  handled = TRUE;

beach:
  g_object_unref (reader);

  return handled;
}

static void
test_fixture_compile_and_load_script (TestFixture * fixture,
                                      const gchar * source_template,
                                      ...)
{
  va_list args;
  gchar * raw_source, * source;
  GError * err = NULL;

  if (fixture->script != NULL)
  {
    gum_script_unload_sync (fixture->script, NULL);
    g_object_unref (fixture->script);
    fixture->script = NULL;
  }

  va_start (args, source_template);
  raw_source = g_strdup_vprintf (source_template, args);
  va_end (args);

  source = g_strconcat (
      frida_swift_bundle,
      "\n;\n",
      "(function testcase(Swift) {\n",
      raw_source, "\n",
      "})(LocalSwift);",
      NULL);

  fixture->script = gum_script_backend_create_sync (fixture->backend,
      "testcase", source, NULL, NULL, &err);
  if (err != NULL)
    g_printerr ("%s\n", err->message);
  g_assert (fixture->script != NULL);
  g_assert (err == NULL);

  g_free (source);
  g_free (raw_source);

  gum_script_set_message_handler (fixture->script,
      test_fixture_store_message, fixture, NULL);

  gum_script_load_sync (fixture->script, NULL);
}

static TestMessageItem *
test_fixture_try_pop_message (TestFixture * fixture,
                              guint timeout)
{
  if (g_queue_is_empty (&fixture->messages))
  {
    GSource * source;

    source = g_timeout_source_new (timeout);
    g_source_set_callback (source, (GSourceFunc) test_fixture_stop_loop,
        fixture, NULL);
    g_source_attach (source, fixture->context);

    g_main_loop_run (fixture->loop);

    g_source_destroy (source);
    g_source_unref (source);
  }

  return g_queue_pop_head (&fixture->messages);
}

static gboolean
test_fixture_stop_loop (TestFixture * fixture)
{
  g_main_loop_quit (fixture->loop);

  return FALSE;
}

static TestMessageItem *
test_fixture_pop_message (TestFixture * fixture)
{
  guint timeout;
  TestMessageItem * item;

  timeout = GPOINTER_TO_UINT (g_queue_peek_tail (&fixture->timeouts));

  item = test_fixture_try_pop_message (fixture, timeout);
  g_assert (item != NULL);

  return item;
}

static void
test_fixture_expect_send_message_with (TestFixture * fixture,
                                       const gchar * payload_template,
                                       ...)
{
  va_list args;
  gchar * payload;
  TestMessageItem * item;
  gchar * expected_message;

  va_start (args, payload_template);
  payload = g_strdup_vprintf (payload_template, args);
  va_end (args);

  item = test_fixture_pop_message (fixture);
  expected_message =
      g_strconcat ("{\"type\":\"send\",\"payload\":", payload, "}", NULL);
  g_assert_cmpstr (item->message, ==, expected_message);
  test_message_item_free (item);
  g_free (expected_message);

  g_free (payload);
}

static void
test_fixture_expect_send_message_with_prefix (TestFixture * fixture,
                                              const gchar * prefix_template,
                                              ...)
{
  va_list args;
  gchar * prefix;
  TestMessageItem * item;
  gchar * expected_message_prefix;

  va_start (args, prefix_template);
  prefix = g_strdup_vprintf (prefix_template, args);
  va_end (args);

  item = test_fixture_pop_message (fixture);
  expected_message_prefix =
      g_strconcat ("{\"type\":\"send\",\"payload\":", prefix, NULL);
  g_assert (g_str_has_prefix (item->message, expected_message_prefix));
  test_message_item_free (item);
  g_free (expected_message_prefix);

  g_free (prefix);
}

static void
test_fixture_expect_send_message_with_payload_and_data (TestFixture * fixture,
                                                        const gchar * payload,
                                                        const gchar * data)
{
  TestMessageItem * item;
  gchar * expected_message;

  item = test_fixture_pop_message (fixture);
  expected_message =
      g_strconcat ("{\"type\":\"send\",\"payload\":", payload, "}", NULL);
  g_assert_cmpstr (item->message, ==, expected_message);
  if (data != NULL)
  {
    g_assert (item->data != NULL);
    g_assert_cmpstr (item->data, ==, data);
  }
  else
  {
    g_assert (item->data == NULL);
  }
  test_message_item_free (item);
  g_free (expected_message);
}

static void
test_fixture_expect_error_message_with (TestFixture * fixture,
                                        gint line_number,
                                        const gchar * description)
{
  TestMessageItem * item;
  gchar actual_description[1024];
  gchar actual_stack[1024];
  gchar actual_file_name[64];
  gint actual_line_number;
  gint actual_column_number;

  item = test_fixture_pop_message (fixture);

  actual_description[0] = '\0';
  actual_stack[0] = '\0';
  actual_file_name[0] = '\0';
  actual_line_number = -1;
  actual_column_number = -1;
  sscanf (item->message, "{"
          "\"type\":\"error\","
          "\"description\":\"%[^\"]\","
          "\"stack\":\"%[^\"]\","
          "\"fileName\":\"%[^\"]\","
          "\"lineNumber\":%d,"
          "\"columnNumber\":%d"
      "}",
      actual_description,
      actual_stack,
      actual_file_name,
      &actual_line_number,
      &actual_column_number);
  if (actual_column_number == -1)
  {
    sscanf (item->message, "{"
            "\"type\":\"error\","
            "\"description\":\"%[^\"]\""
        "}",
        actual_description);
  }
  if (line_number != ANY_LINE_NUMBER)
    g_assert_cmpint (actual_line_number, ==, line_number);
  g_assert_cmpstr (actual_description, ==, description);
  test_message_item_free (item);
}

static void
test_fixture_expect_log_message_with (TestFixture * fixture,
                                      const gchar * level,
                                      const gchar * payload_template,
                                      ...)
{
  va_list args;
  gchar * payload;
  TestMessageItem * item;
  gchar * expected_message;

  va_start (args, payload_template);
  payload = g_strdup_vprintf (payload_template, args);
  va_end (args);

  item = test_fixture_pop_message (fixture);
  expected_message = g_strconcat ("{\"type\":\"log\",\"level\":\"", level,
      "\",\"payload\":\"", payload, "\"}", NULL);
  g_assert_cmpstr (item->message, ==, expected_message);
  test_message_item_free (item);
  g_free (expected_message);

  g_free (payload);
}

static void
test_fixture_push_timeout (TestFixture * fixture,
                           guint timeout)
{
  g_queue_push_tail (&fixture->timeouts, GUINT_TO_POINTER (timeout));
}

static void
test_fixture_pop_timeout (TestFixture * fixture)
{
  g_queue_pop_tail (&fixture->timeouts);
}
