/*
 * Copyright (C) 2021 Abdelrahman Eid <aeid@nowsecure.com>
 *
 * Licence: wxWindows Library Licence, Version 3.1
 */

#define SUITE "/Basics"
#include "fixture.c"

TESTLIST_BEGIN (basics)
    TESTENTRY (modules_can_be_enumerated)
    TESTENTRY (types_can_be_enumerated)
    TESTENTRY (c_style_enum_can_be_made_from_raw)
    TESTENTRY (c_style_enum_cases_can_be_gotten)
    TESTENTRY (c_style_enum_equals_works)
    TESTENTRY (singlepayload_enum_empty_case_can_be_made_from_raw)
    TESTENTRY (singlepayload_enum_data_case_can_be_made_from_raw)
    TESTENTRY (singlepayload_enum_equals_works)
    /*
    TESTENTRY (c_style_enum_as_a_function_argument)
    TESTENTRY (c_style_enums_with_raw_values)
    */
    TESTENTRY (swiftcall_with_context)
    TESTENTRY (swiftcall_with_indirect_result)
    TESTENTRY (swiftcall_with_direct_result)
    TESTENTRY (swiftcall_with_indirect_result_and_stack_arguments)
TESTLIST_END ()

TESTCASE (modules_can_be_enumerated)
{
  COMPILE_AND_LOAD_SCRIPT(
    "send(Object.keys(Swift.modules).length > 3);"
    "send(Swift.modules.Swift.$allTypes.length > 100);"
    "send(Swift.modules.dummy.$allTypes.length > 10);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (types_can_be_enumerated)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var numClasses = Object.keys(Swift.classes).length;"
    "send(numClasses > 50);"
    "var numStructs = Object.keys(Swift.structs).length;"
    "send(numStructs > 100);"
    "var numEnums = Object.keys(Swift.enums).length;"
    "send(numEnums > 70);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (c_style_enum_can_be_made_from_raw)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var CStyle = Swift.enums.CStyle;"
    "var buf = new ArrayBuffer(1);"
    "var dv = new DataView(buf);"
    "dv.setUint8(0, 1);"
    "var e = CStyle.makeFromRaw(buf.unwrap());"
    "send(e.tag === 1);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (c_style_enum_cases_can_be_gotten)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var CStyle = Swift.enums.CStyle;"
    "var b = CStyle.b;"
    "send(b.tag === 1);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (c_style_enum_equals_works)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var CStyle = Swift.enums.CStyle;"
    "var b1 = CStyle.b;"
    "var b2 = CStyle.b;"
    "send(b1.equals(b2));"
    "var e = CStyle.e;"
    "send(b2.equals(e));"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("false");
}


TESTCASE (singlepayload_enum_empty_case_can_be_made_from_raw)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var SinglePayloadEnumWithNoExtraInhabitants = Swift.enums.SinglePayloadEnumWithNoExtraInhabitants;"
    "var d = SinglePayloadEnumWithNoExtraInhabitants.d;"
    "send(d.tag === 3);"
    "var SinglePayloadEnumWithExtraInhabitants = Swift.enums.SinglePayloadEnumWithExtraInhabitants;"
    "var c = SinglePayloadEnumWithExtraInhabitants.c;"
    "send(c.tag === 2);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (singlepayload_enum_data_case_can_be_made_from_raw)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var Int = Swift.structs.Int;"
    "var buffer = new ArrayBuffer(8);"
    "var zero = Int.makeFromRaw(buffer);"
    "var SinglePayloadEnumWithNoExtraInhabitants = Swift.enums.SinglePayloadEnumWithNoExtraInhabitants;"
    "var i = SinglePayloadEnumWithNoExtraInhabitants.Some(zero);"
    "send(i.payload.handle.equals(zero.handle));"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (singlepayload_enum_equals_works)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy10makeStringSSyF');"
    "var target = symbols[0].address;"
    "var String = Swift.structs.String;"
    "var makeString = Swift.NativeFunction(target, String, []);"
    "var SinglePayloadEnumWithExtraInhabitants = Swift.enums.SinglePayloadEnumWithExtraInhabitants;"
    "var newCairo = makeString();"
    "var s1 = SinglePayloadEnumWithExtraInhabitants.Some(newCairo);"
    "var s2 = SinglePayloadEnumWithExtraInhabitants.Some(newCairo);"
    "send(s1.equals(s2));"
    "var a = SinglePayloadEnumWithExtraInhabitants.a;"
    "var b = SinglePayloadEnumWithExtraInhabitants.b;"
    "send(a.equals(b))"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("false");
}

/*
TESTCASE (c_style_enum_as_a_function_argument)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var CStyle = Swift.enums.CStyle;"
  );
}

TESTCASE (c_style_enums_with_raw_values)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var CStyle = Swift.enums.CStyle;"
  );
}
*/

TESTCASE (swiftcall_with_context)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var Int = Swift.structs.Int;"
    "var buf1 = new ArrayBuffer(8);"
    "var dv1 = new DataView(buf1);"
    "dv1.setUint32(0, 0xDEAD);"
    "var i1 = Int.makeFromRaw(buf1);"
    "var buf2 = new ArrayBuffer(8);"
    "var dv2 = new DataView(buf2);"
    "dv2.setUint32(0, 0xBABE);"
    "var i2 = Int.makeFromRaw(buf2);"
    "var SimpleClass = Swift.classes.SimpleClass;"
    "var initPtr = SimpleClass.$methods[SimpleClass.$methods.length - 1].address;" // TODO parse initializer
    "var init = Swift.NativeFunction(initPtr, SimpleClass, [Int, Int], SimpleClass.metadataPointer);"
    "var instance = init(i1, i2);"
    "send(instance.equals(ptr(0x0)));"
  );
  EXPECT_SEND_MESSAGE_WITH ("false");
}

TESTCASE (swiftcall_with_indirect_result)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy15returnBigStructAA0cD0VyF');"
    "var target = symbols[0].address;"
    "var BigStruct = Swift.structs.BigStruct;"
    "var returnBigStruct = Swift.NativeFunction(target, BigStruct, []);"
    "var big = returnBigStruct();"
    "send(big.buffer.byteLength > 0)"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (swiftcall_with_direct_result)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy17getLoadableStructAA0cD0VyF');"
    "var target = symbols[0].address;"
    "var LoadableStruct = Swift.structs.LoadableStruct;"
    "var getLoadableStruct = Swift.NativeFunction(target, LoadableStruct, []);"
    "var loadable = getLoadableStruct();"
    "send(loadable.buffer.byteLength == 32);"
    "var dv = new DataView(loadable.buffer);"
    "send(dv.getUint32(16, true) === 3);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE(swiftcall_with_indirect_result_and_stack_arguments)
{
  COMPILE_AND_LOAD_SCRIPT(
      "var dummy = Process.getModuleByName('dummy.o');"
      "var symbols = dummy.enumerateSymbols();"
      "symbols = symbols.filter(s => s.name == '$s5dummy30makeBigStructWithManyArguments4with3and1a1b1c1d1eAA0cD0VAA08LoadableD0V_AMS5itF');"
      "var target = symbols[0].address;"
      "var Int = Swift.structs.Int;"
      "var BigStruct = Swift.structs.BigStruct;"
      "var LoadableStruct = Swift.structs.LoadableStruct;"
      "var makeBigStructWithManyArguments = Swift.NativeFunction(target, BigStruct, [LoadableStruct, LoadableStruct, Int, Int, Int, Int, Int]);"
      "symbols = dummy.enumerateSymbols().filter(s => s.name === '$s5dummy18makeLoadableStruct1a1b1c1dAA0cD0VSi_S3itF');"
      "target = symbols[0].address;"
      "var makeLoadableStruct = Swift.NativeFunction(target, LoadableStruct, [Int, Int, Int, Int]);"
      "var buf1 = new ArrayBuffer(8);"
      "var dv1 = new DataView(buf1);"
      "dv1.setUint32(0, 0x01, true);"
      "var i1 = Int.makeFromRaw(buf1);"
      "var loadable = makeLoadableStruct(i1, i1, i1, i1);"
      "var big = makeBigStructWithManyArguments(loadable, loadable, i1, i1, i1, i1, i1);"
      "send(!big.handle.equals(ptr(0x0)));"
      "var dv = new DataView(big.buffer);"
      "send(dv.getUint32(0x20, true) === 1);"
      "send(dv.getUint32(0x10, true) === 3);");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}
