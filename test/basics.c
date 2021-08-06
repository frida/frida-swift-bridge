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
    TESTENTRY (swiftcall_with_context) /* TODO: test with struct context */
    TESTENTRY (swiftcall_with_indirect_result)
    TESTENTRY (swiftcall_with_direct_result)
    TESTENTRY (swiftcall_with_indirect_result_and_stack_arguments)
    TESTENTRY (swiftcall_multipayload_enum_can_be_passed_to_function)
    TESTENTRY (swiftcall_multipayload_enum_can_be_returned_from_function)
    TESTENTRY (c_style_enum_can_be_made_from_raw)
    TESTENTRY (c_style_enum_cases_can_be_gotten)
    TESTENTRY (c_style_enum_equals_works)
    TESTENTRY (singlepayload_enum_empty_case_can_be_made_from_raw)
    TESTENTRY (singlepayload_enum_empty_case_can_be_gotten)
    TESTENTRY (singlepayload_enum_data_case_can_be_made_from_raw)
    TESTENTRY (singlepayload_enum_data_case_can_be_made_ad_hoc)
    TESTENTRY (singlepayload_enum_equals_works)
    TESTENTRY (multipayload_enum_empty_case_can_be_made_from_raw)
    TESTENTRY (multipayload_enum_empty_case_can_be_gotten)
    TESTENTRY (multipayload_enum_data_case_can_be_made_from_raw)
    TESTENTRY (multipayload_enum_data_case_can_be_made_ad_hoc)
    TESTENTRY (multipayload_enum_equals_works)
    TESTENTRY (protocol_num_requirements_can_be_gotten)
    TESTENTRY (protocol_conformance_can_be_gotten)
TESTLIST_END ()

TESTCASE (modules_can_be_enumerated)
{
  COMPILE_AND_LOAD_SCRIPT(
    "send(Object.keys(Swift.modules).length > 3);"
    "send(Swift.modules.Swift.$allTypes.length > 100);"
    "send(Swift.modules.dummy.$allTypes.length > 8);"
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
    "var numProtos = Object.keys(Swift.protocols).length;"
    "send(numProtos > 100);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (swiftcall_with_context)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var Int = Swift.structs.Int;"
    "var buf1 = Memory.alloc(8);"
    "buf1.writeU64(0xDEAD);"
    "var i1 = Int.makeFromRaw(buf1);"
    "var buf2 = Memory.alloc(8);"
    "buf2.writeU64(0xBABE);"
    "var i2 = Int.makeFromRaw(buf2);"
    "var SimpleClass = Swift.classes.SimpleClass;"
    "var initPtr = SimpleClass.$methods[SimpleClass.$methods.length - 1].address;" // TODO parse initializer
    "var init = Swift.NativeFunction(initPtr, SimpleClass, [Int, Int], SimpleClass.metadataPointer);"
    "var instance = init(i1, i2);"
    "send(instance.handle.equals(ptr(0x0)));"
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
    "send(big.handle.readU64() == 1);"
    "send(big.handle.add(0x20).readU64() == 5);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
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
    "send(loadable.handle.readU64() == 1);"
    "send(loadable.handle.add(0x10).readU64() == 3);"
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
      "var buf1 = Memory.alloc(8);"
      "buf1.writeU64(0x1);"
      "var i1 = Int.makeFromRaw(buf1);"
      "var loadable = makeLoadableStruct(i1, i1, i1, i1);"
      "var big = makeBigStructWithManyArguments(loadable, loadable, i1, i1, i1, i1, i1);"
      "send(!big.handle.equals(ptr(0x0)));"
      "send(big.handle.add(0x20).readU32() == 1);"
      "send(big.handle.add(0x10).readU32() == 3);");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (swiftcall_multipayload_enum_can_be_passed_to_function)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy20takeMultiPayloadEnum4kaseSiAA0cdE0O_tF');"
    "var target = symbols[0].address;"
    "var Int = Swift.structs.Int;"
    "var MultiPayloadEnum = Swift.enums.MultiPayloadEnum;"
    "var takeMultiPayloadEnumCase = Swift.NativeFunction(target, Int, [MultiPayloadEnum]);"
     "var buf = Memory.alloc(8);"
    "buf.writeU64(0xCAFE);"
    "var i = Int.makeFromRaw(buf);"
    "var a = MultiPayloadEnum.a(i);"
    "send(takeMultiPayloadEnumCase(a).handle.readU64() == 0);"
    "var Bool = Swift.structs.Bool;"
    "var truthy = Bool.makeFromRaw(Memory.alloc(1).writeU8(1));"
    "var d = MultiPayloadEnum.d(truthy);"
    "send(takeMultiPayloadEnumCase(d).handle.readU64() == 3);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (swiftcall_multipayload_enum_can_be_returned_from_function)
{
    COMPILE_AND_LOAD_SCRIPT(
    "var Int = Swift.structs.Int;"
    "var tag0 = Int.makeFromRaw(Memory.alloc(8).writeU64(0x0));"
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy24makeMultiPayloadEnumCase4withAA0cdE0OSi_tF');"
    "var target = symbols[0].address;"
    "var MultiPayloadEnum = Swift.enums.MultiPayloadEnum;"
    "var makeMultiPayloadEnumCase = Swift.NativeFunction(target, MultiPayloadEnum, [Int]);"
    "var a = makeMultiPayloadEnumCase(tag0);"
    "send(a.tag === 0);"
    "send(a.payload.handle.readU64() == 0x1337);"
    "var tag1 = Int.makeFromRaw(Memory.alloc(8).writeU64(0x1));"
    "var b = makeMultiPayloadEnumCase(tag1);"
    "send(b.tag === 1);"
    "send(b.payload.handle.readCString() == 'Octagon');"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (c_style_enum_can_be_made_from_raw)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var CStyle = Swift.enums.CStyle;"
    "var buf = Memory.alloc(1);"
    "buf.writeU8(1);"
    "var e = CStyle.makeFromRaw(buf);"
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
    "var rawA = Memory.alloc(16);"
    "rawA.add(8).writeU8(1);"
    "var SinglePayloadEnumWithNoExtraInhabitants = Swift.enums.SinglePayloadEnumWithNoExtraInhabitants;"
    "var a = SinglePayloadEnumWithNoExtraInhabitants.makeFromRaw(rawA);"
    "send(a.tag === 1);"
    "rawA = Memory.alloc(16);"
    "var SinglePayloadEnumWithExtraInhabitants = Swift.enums.SinglePayloadEnumWithExtraInhabitants;"
    "a = SinglePayloadEnumWithExtraInhabitants.makeFromRaw(rawA);"
    "send(a.tag === 1);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (singlepayload_enum_empty_case_can_be_gotten)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var SinglePayloadEnumWithNoExtraInhabitants = Swift.enums.SinglePayloadEnumWithNoExtraInhabitants;"
    "var d = SinglePayloadEnumWithNoExtraInhabitants.d;"
    "send(d.tag === 4);"
    "var SinglePayloadEnumWithExtraInhabitants = Swift.enums.SinglePayloadEnumWithExtraInhabitants;"
    "var c = SinglePayloadEnumWithExtraInhabitants.c;"
    "send(c.tag === 3);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (singlepayload_enum_data_case_can_be_made_from_raw)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var rawSome = Memory.alloc(16);"
    "rawSome.writeU64(0x1337);"
    "var SinglePayloadEnumWithNoExtraInhabitants = Swift.enums.SinglePayloadEnumWithNoExtraInhabitants;"
    "var some = SinglePayloadEnumWithNoExtraInhabitants.makeFromRaw(rawSome);"
    "send(some.tag === 0);"
    "var SinglePayloadEnumWithExtraInhabitants = Swift.enums.SinglePayloadEnumWithExtraInhabitants;"
    "rawSome = Memory.alloc(16);"
    "rawSome.writeByteArray([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe5]);"
    "some = SinglePayloadEnumWithExtraInhabitants.makeFromRaw(rawSome);"
    "send(some.tag === 0);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (singlepayload_enum_data_case_can_be_made_ad_hoc)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var Int = Swift.structs.Int;"
    "var buffer = Memory.alloc(8);"
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

TESTCASE (multipayload_enum_empty_case_can_be_made_from_raw)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var rawF = Memory.alloc(24);"
    "rawF.writeU8(1);"
    "rawF.add(0x10).writeU8(4);"
    "var MultiPayloadEnum = Swift.enums.MultiPayloadEnum;"
    "var f = MultiPayloadEnum.makeFromRaw(rawF);"
    "send(f.tag === 5);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (multipayload_enum_empty_case_can_be_gotten)
{
  COMPILE_AND_LOAD_SCRIPT (
    "var MultiPayloadEnum = Swift.enums.MultiPayloadEnum;"
    "send(MultiPayloadEnum.e.tag === 4);"
    "send(MultiPayloadEnum.f.tag === 5);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (multipayload_enum_data_case_can_be_made_from_raw)
{
  COMPILE_AND_LOAD_SCRIPT (
    "var rawB = Memory.alloc(24);"
    "rawB.writeByteArray([0x57, 0x6f, 0x72, 0x6c, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe5]);"
    "rawB.add(0x10).writeU8(1);"
    "var MultiPayloadEnum = Swift.enums.MultiPayloadEnum;"
    "var b = MultiPayloadEnum.makeFromRaw(rawB);"
    "send(b.tag === 1);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (multipayload_enum_data_case_can_be_made_ad_hoc)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var buf = Memory.alloc(8);"
    "buf.writeU64(0xCAFE);"
    "var Int = Swift.structs.Int;"
    "var i = Int.makeFromRaw(buf);"
    "var MultiPayloadEnum = Swift.enums.MultiPayloadEnum;"
    "var a = MultiPayloadEnum.a(i);"
    "send(a.tag === 0);"
    "send(a.payload.handle.readU64() == 0xCAFE);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (multipayload_enum_equals_works)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var MultiPayloadEnum = Swift.enums.MultiPayloadEnum;"
    "send(MultiPayloadEnum.e.equals(MultiPayloadEnum.f));"
    "var buf1 = Memory.alloc(8);"
    "buf1.writeU64(0xCAFE);"
    "var Int = Swift.structs.Int;"
    "var i1 = Int.makeFromRaw(buf1);"
    "var MultiPayloadEnum = Swift.enums.MultiPayloadEnum;"
    "var a1 = MultiPayloadEnum.a(i1);"
    "var buf2 = Memory.alloc(8);"
    "buf2.writeU64(0xBABE);"
    "var i2 = Int.makeFromRaw(buf2);"
    "var a2 = MultiPayloadEnum.a(i2);"
    "send(a1.equals(a2));"
  );
  EXPECT_SEND_MESSAGE_WITH ("false");
  EXPECT_SEND_MESSAGE_WITH ("false");
}

TESTCASE (protocol_num_requirements_can_be_gotten)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var SomeProtocol = Swift.protocols.SomeProtocol;"
    "send(SomeProtocol.numRequirements === 4);"
    "var Togglable = Swift.protocols.Togglable;"
    "send(Togglable.numRequirements === 1);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (protocol_conformance_can_be_gotten)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var URL = Swift.structs.URL;"
    "send(URL.conformsToProtocols.includes('Hashable'));"
    "var OnOffSwitch = Swift.enums.OnOffSwitch;"
    "send(OnOffSwitch.conformsToProtocols.includes('Togglable'));"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

