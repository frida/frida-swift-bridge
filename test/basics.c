/*
 * Copyright (C) 2021 Abdelrahman Eid <aeid@nowsecure.com>
 *
 * Licence: wxWindows Library Licence, Version 3.1
 */

#define SUITE "/Basics"
#include "fixture.c"

TESTLIST_BEGIN (basics)
    TESTENTRY (classes_can_be_enumerated)
TESTLIST_END ()

TESTCASE (classes_can_be_enumerated)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var numClasses = Object.keys(Swift.classes).length;"
    "send(numClasses > 10);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
}
