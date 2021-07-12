/*
 * Copyright (C) 2008-2020 Ole André Vadla Ravnås <oleavr@nowsecure.com>
 * Copyright (C) 2009 Haakon Sporsheim <haakon.sporsheim@gmail.com>
 *
 * Licence: wxWindows Library Licence, Version 3.1
 */

#ifndef __TEST_FIXTURE_H__
#define __TEST_FIXTURE_H__

#include <frida-gumjs.h>

#define TESTLIST_BEGIN(NAME)                                                \
    void test_ ##NAME## _add_tests (gpointer fixture_data)                  \
    {                                                                       \
      const gchar * group = "";
#define TESTLIST_END()                                                      \
    }

#define TESTENTRY_SIMPLE(NAME, PREFIX, FUNC)                                \
    G_STMT_START                                                            \
    {                                                                       \
      extern void PREFIX## _ ##FUNC (void);                                 \
      g_test_add_func ("/" NAME "/" #FUNC, PREFIX## _ ##FUNC);              \
    }                                                                       \
    G_STMT_END;
#define TESTENTRY_WITH_FIXTURE(NAME, PREFIX, FUNC, STRUCT)                  \
    G_STMT_START                                                            \
    {                                                                       \
      extern void PREFIX## _ ##FUNC (STRUCT * fixture, gconstpointer data); \
      g_test_add ("/" NAME "/" #FUNC,                                       \
          STRUCT,                                                           \
          fixture_data,                                                     \
          PREFIX## _fixture_setup,                                          \
          PREFIX## _ ##FUNC,                                                \
          PREFIX## _fixture_teardown);                                      \
    }                                                                       \
    G_STMT_END;

#define TESTGROUP_BEGIN(NAME)                                               \
    group = NAME;
#define TESTGROUP_END()                                                     \
    group = "";

#define TEST_RUN_LIST(NAME) TEST_RUN_LIST_WITH_DATA (NAME, NULL)
#define TEST_RUN_LIST_WITH_DATA(NAME, FIXTURE_DATA)                         \
  G_STMT_START                                                              \
  {                                                                         \
    extern void test_ ##NAME## _add_tests (gpointer fixture_data);          \
    test_ ##NAME## _add_tests (FIXTURE_DATA);                               \
  }                                                                         \
  G_STMT_END

#endif
