/*
 * Copyright (C) 2021 Abdelrahman Eid <hot3eed@nowsecure.com>
 *
 * Licence: wxWindows Library Licence, Version 3.1
 */

/**
 * TODO:
 *  - Test swiftcall with a struct context
 *  - Test enums with class payloads
 */

#define SUITE "/Basics"
#include "fixture.c"

TESTLIST_BEGIN (basics)
    TESTENTRY (modules_can_be_enumerated)
    TESTENTRY (types_can_be_enumerated)
    TESTENTRY (swiftcall_with_context)
    TESTENTRY (swiftcall_with_indirect_argument)
    TESTENTRY (swiftcall_with_indirect_result)
    TESTENTRY (swiftcall_with_direct_result)
    TESTENTRY (swiftcall_with_indirect_result_and_stack_arguments)
    TESTENTRY (swiftcall_with_direct_typed_result)
    TESTENTRY (swiftcall_with_void_return_type)
    TESTENTRY (class_instance_can_be_initialized)
    TESTENTRY (class_instance_methods_can_be_called)
    TESTENTRY (class_instance_properties_can_be_gotten_and_set)
    TESTENTRY (class_instance_can_be_passed_to_and_returned_from_function)
    TESTENTRY (swiftcall_multipayload_enum_can_be_passed_to_function)
    TESTENTRY (swiftcall_multipayload_enum_can_be_returned_from_function)
    TESTENTRY (opaque_existential_inline_can_be_passed_to_function)
    TESTENTRY (opaque_existential_inline_can_be_returned_from_function)
    TESTENTRY (opaque_existential_outofline_can_be_passed_to_function)
    TESTENTRY (opaque_existential_outofline_can_be_returned_from_function)
    TESTENTRY (opaque_existential_class_can_be_passed_to_and_returned_from_function)
    TESTENTRY (opaque_existential_inline_multiple_conformances_can_be_passed_to_and_returned_from_function)
    TESTENTRY (class_existential_can_be_passed_to_and_returned_from_function)
    TESTENTRY (class_existential_multiple_conformances_can_be_passed_to_and_rerturned_from_function)
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
    TESTENTRY (interceptor_can_parse_struct_value_arguments)
    TESTENTRY (interceptor_can_parse_enum_value_arguments)
    TESTENTRY (interceptor_can_parse_class_instance_arguments)
    TESTENTRY (interceptor_can_parse_stack_arguments)
    TESTENTRY (interceptor_can_parse_opaque_existential_container_arguments)
    TESTENTRY (interceptor_can_parse_class_existential_container_arguments)
    TESTENTRY (interceptor_can_parse_direct_return_value)
    TESTENTRY (interceptor_can_parse_indirect_return_value)
    TESTENTRY (interceptor_can_parse_opaque_existential_container_return_value)
    TESTENTRY (interceptor_can_parse_class_existential_container_return_value)
TESTLIST_END ()

TESTCASE (modules_can_be_enumerated)
{
  COMPILE_AND_LOAD_SCRIPT(
    "send(Object.keys(Swift.modules).length > 5);"
    "send(Object.keys(Swift.modules.Swift.classes).length > 20);"
    "send(Object.keys(Swift.modules.Swift.enums).length > 20);"
    "send(Object.keys(Swift.modules.Swift.protocols).length > 100);"
    "send(Object.keys(Swift.modules.Swift.structs).length > 90);"
    "send(Object.keys(Swift.modules.dummy.classes).length > 4);"
    "send(Object.keys(Swift.modules.Swift.enums).length > 4);"
    "send(Object.keys(Swift.modules.Swift.protocols).length > 2);"
    "send(Object.keys(Swift.modules.Swift.structs).length > 4);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
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
    "var i1 = new Swift.Struct(Int, { raw: [0xDEAD] });"
    "var i2 = new Swift.Struct(Int, { raw: [0xBABE] });"
    "var SimpleClass = Swift.classes.SimpleClass;"
    "var initPtr = SimpleClass.$methods.filter(m => m.type === 'Init')[0].address;"
    "var init = Swift.NativeFunction(initPtr, SimpleClass, [Int, Int], SimpleClass.$metadataPointer);"
    "var instance = init(i1, i2);"
    "send(instance.handle.equals(ptr(0x0)));"
  );
  EXPECT_SEND_MESSAGE_WITH ("false");
}

TESTCASE (swiftcall_with_indirect_argument)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy15returnBigStructAA0cD0VyF');"
    "var target = symbols[0].address;"
    "var BigStruct = Swift.structs.BigStruct;"
    "var returnBigStruct = Swift.NativeFunction(target, BigStruct, []);"
    "var big = returnBigStruct();"
    "symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy13takeBigStructySbAA0cD0VF');"
    "target = symbols[0].address;"
    "var Bool = Swift.structs.Bool;"
    "var takeBigStruct = Swift.NativeFunction(target, Bool, [BigStruct]);"
    "var result = takeBigStruct(big);"
    "send(result.handle.readU8() == 1);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
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
      "var i1 = new Swift.Struct(Int, { raw: [1] });"
      "var loadable = makeLoadableStruct(i1, i1, i1, i1);"
      "var big = makeBigStructWithManyArguments(loadable, loadable, i1, i1, i1, i1, i1);"
      "send(!big.handle.equals(ptr(0x0)));"
      "send(big.handle.add(0x20).readU32() == 1);"
      "send(big.handle.add(0x10).readU32() == 3);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (swiftcall_with_direct_typed_result)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var LoadableStruct = Swift.structs.LoadableStruct;"
    "var box = Swift.api.swift_allocBox(LoadableStruct.$metadataPointer);"
    "send(box[0] instanceof NativePointer);"
    "send(box[1] instanceof NativePointer);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (swiftcall_with_void_return_type)
{
  COMPILE_AND_LOAD_SCRIPT(
      "var dummy = Process.getModuleByName('dummy.o');"
      "var symbols = dummy.enumerateSymbols();"
      "symbols = symbols.filter(s => s.name == '$s5dummy6change6numberySiz_tF');"
      "var target = symbols[0].address;"
      "var change = Swift.NativeFunction(target, 'void', ['pointer']);"
      "var i = Memory.alloc(Process.pointerSize).writeU64(0);"
      "change(i);"
      "send(i.readU64() == 1337);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (class_instance_can_be_initialized)
{
  COMPILE_AND_LOAD_SCRIPT (
    "var { Int } = Swift.structs;"
    "var i2 = new Swift.Struct(Int, { raw: [2] });"
    "var i3 = new Swift.Struct(Int, { raw: [3] });"
    "var SimpleClass = Swift.classes.SimpleClass;"
    "var instance = SimpleClass.__allocating_init$first_second_(i2, i3);"
    "send(instance.handle.add(Process.pointerSize * 2).readU64() == 2);"
    "send(instance.handle.add(Process.pointerSize * 3).readU64() == 3);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (class_instance_methods_can_be_called)
{
   COMPILE_AND_LOAD_SCRIPT (
    "var { Int } = Swift.structs;"
    "var i2 = new Swift.Struct(Int, { raw: [2] });"
    "var i3 = new Swift.Struct(Int, { raw: [3] });"
    "var SimpleClass = Swift.classes.SimpleClass;"
    "var instance = SimpleClass.__allocating_init$first_second_(i2, i3);"
    "send(instance.multiply().handle.readU64() == 6);"
    "var i4 = new Swift.Struct(Int, { raw: [4] });"
    "send(instance.multiply$with_(i4).handle.readU64() == 24);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (class_instance_properties_can_be_gotten_and_set)
{
   COMPILE_AND_LOAD_SCRIPT (
    "var { Int } = Swift.structs;"
    "var i2 = new Swift.Struct(Int, { raw: [2] });"
    "var i3 = new Swift.Struct(Int, { raw: [3] });"
    "var SimpleClass = Swift.classes.SimpleClass;"
    "var instance = SimpleClass.__allocating_init$first_second_(i2, i3);"
    "send(instance.x.handle.readU64() == 2);"
    "instance.x = new Swift.Struct(Int, { raw: [9] });"
    "send(instance.x.handle.readU64() == 9)"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (class_instance_can_be_passed_to_and_returned_from_function)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var dummy = Process.getModuleByName('dummy.o');"
    "var SimpleClass = Swift.classes.SimpleClass;"
    "var Int = Swift.structs.Int;"
    "var i1 = new Swift.Struct(Int, { raw: [0x1337] });"
    "var i2 = new Swift.Struct(Int, { raw: [0xaaaa] });"
    "var simple = SimpleClass.__allocating_init$first_second_(i1, i2);"
    "send(simple.$metadata.handle.equals(SimpleClass.$metadataPointer));"
    "send(simple.handle.add(2 * Process.pointerSize).readU64() == 0x1337);"
    "send(simple.handle.add(3 * Process.pointerSize).readU64() == 0xaaaa);"
  );
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
    "var i = new Swift.Struct(Int, { raw: [0xCAFE] });"
    "var a = MultiPayloadEnum.a(i);"
    "send(takeMultiPayloadEnumCase(a).handle.readU64() == 0);"
    "var Bool = Swift.structs.Bool;"
    "var truthy = new Swift.Struct(Bool, { raw: [1] });"
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
    "var tag0 = new Swift.Struct(Int, { raw: [0] });"
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy24makeMultiPayloadEnumCase4withAA0cdE0OSi_tF');"
    "var target = symbols[0].address;"
    "var MultiPayloadEnum = Swift.enums.MultiPayloadEnum;"
    "var makeMultiPayloadEnumCase = Swift.NativeFunction(target, MultiPayloadEnum, [Int]);"
    "var a = makeMultiPayloadEnumCase(tag0);"
    "send(a.$tag === 0);"
    "send(a.$payload.handle.readU64() == 0x1337);"
    "var tag1 = new Swift.Struct(Int, { raw: [1] });"
    "var b = makeMultiPayloadEnumCase(tag1);"
    "send(b.$tag === 1);"
    "send(b.$payload.handle.readCString() == 'Octagon');"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (opaque_existential_inline_can_be_passed_to_function)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy27takeInlineExistentialStructySbAA0D0_pF');"
    "var target = symbols[0].address;"
    "var Existential = Swift.protocols.Existential;"
    "var Bool = Swift.structs.Bool;"
    "var takeInlineExistentialStruct = Swift.NativeFunction(target, Bool, [Existential]);"
    "var InlineExistentialStruct = Swift.structs.InlineExistentialStruct;"
    "var inline = new Swift.Struct(InlineExistentialStruct, { raw: [0xCAFE, 0xBABE] });"
    "var result = takeInlineExistentialStruct(inline);"
    "send(result.handle.readU8() == 1);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (opaque_existential_inline_can_be_returned_from_function)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy22passThroughExistentialyAA0D0_pAaC_pF');"
    "var target = symbols[0].address;"
    "var Existential = Swift.protocols.Existential;"
    "var passThroughExistential = Swift.NativeFunction(target, Existential, [Existential]);"
    "var InlineExistentialStruct = Swift.structs.InlineExistentialStruct;"
    "var inline = new Swift.Struct(InlineExistentialStruct, { raw: [0xCAFE, 0xBABE] });"
    "var result = passThroughExistential(inline);"
    "send(result.$metadata.handle.equals(InlineExistentialStruct.$metadata.handle));"
    "send(result.handle.readU64().toNumber() == 0xCAFE);"
    "send(result.handle.add(8).readU64().toNumber() == 0xBABE);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (opaque_existential_outofline_can_be_passed_to_function)
{
 COMPILE_AND_LOAD_SCRIPT(
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy30takeOutOfLineExistentialStructySbAA0F0_pF');"
    "var target = symbols[0].address;"
    "var Existential = Swift.protocols.Existential;"
    "var Bool = Swift.structs.Bool;"
    "var takeOutOfLineExistentialStruct = Swift.NativeFunction(target, Bool, [Existential]);"
    "var OutOfLineExistentialStruct = Swift.structs.OutOfLineExistentialStruct;"
    "var outOfLine = new Swift.Struct(OutOfLineExistentialStruct, { raw: [0xDEAD, 0xBEEF] });"
    "var result = takeOutOfLineExistentialStruct(outOfLine);"
    "send(result.handle.readU8() == 1);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (opaque_existential_outofline_can_be_returned_from_function)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy22passThroughExistentialyAA0D0_pAaC_pF');"
    "var target = symbols[0].address;"
    "var Existential = Swift.protocols.Existential;"
    "var passThroughExistential = Swift.NativeFunction(target, Existential, [Existential]);"
    "var OutOfLineExistentialStruct = Swift.structs.OutOfLineExistentialStruct;"
    "var outOfLine = new Swift.Struct(OutOfLineExistentialStruct, { raw: [0xDEAD, 0xBEEF] });"
    "var result = passThroughExistential(outOfLine);"
    "send(result.$metadata.handle.equals(OutOfLineExistentialStruct.$metadata.handle));"
    "send(result.handle.readU64().toNumber() == 0xDEAD);"
    "send(result.handle.add(8).readU64().toNumber() == 0xBEEF);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (opaque_existential_class_can_be_passed_to_and_returned_from_function)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy22passThroughExistentialyAA0D0_pAaC_pF');"
    "var target = symbols[0].address;"
    "var Existential = Swift.protocols.Existential;"
    "var passThroughExistential = Swift.NativeFunction(target, Existential, [Existential]);"
    "var ExistentialClass = Swift.classes.ExistentialClass;"
    "symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy20makeExistentialClassAA0cD0CyF');"
    "target = symbols[0].address;"
    "var makeExistentialClass = Swift.NativeFunction(target, ExistentialClass, []);"
    "var instance = makeExistentialClass();"
    "var result = passThroughExistential(instance);"
    "send(result.handle.readPointer().equals(ExistentialClass.$metadata.handle));"
    "send(result.handle.add(0x10).readU64() == 0x1337);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (opaque_existential_inline_multiple_conformances_can_be_passed_to_and_returned_from_function)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy31passCompositeExistentialThroughyAA0D0_AA9TogglablepAaC_AaDpF');"
    "var target = symbols[0].address;"
    "var Existential = Swift.protocols.Existential;"
    "var Togglable = Swift.protocols.Togglable;"
    "var ExistentialAndTogglable = new Swift.ProtocolComposition(Existential, Togglable);"
    "var passCompositeExistentialThrough = Swift.NativeFunction(target, ExistentialAndTogglable, [ExistentialAndTogglable]);"
    "var InlineCompositeExistentialStruct = Swift.structs.InlineCompositeExistentialStruct;"
    "var i = new Swift.Struct(InlineCompositeExistentialStruct, { raw: [0xDEAD, 0xBEEF] });"
    "var result = passCompositeExistentialThrough(i);"
    "send(result.handle.readU64(0xDEAD) == 0xDEAD);"
    "send(result.handle.add(8).readU64(0xBEEF) == 0xBEEF);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (class_existential_can_be_passed_to_and_returned_from_function)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var ClassOnlyExistentialClass = Swift.classes.ClassOnlyExistentialClass;"
    "var initPtr = ClassOnlyExistentialClass.$methods[ClassOnlyExistentialClass.$methods.length - 1].address;"
    "var init = Swift.NativeFunction(initPtr, ClassOnlyExistentialClass, [], ClassOnlyExistentialClass.$metadataPointer);"
    "var instance = init();"
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy32passClassBoundExistentialThroughyAA0cdE0_pAaC_pF');"
    "var target = symbols[0].address;"
    "var ClassBoundExistential = Swift.protocols.ClassBoundExistential;"
    "var passClassBoundExistentialThrough = Swift.NativeFunction(target, ClassBoundExistential, [ClassBoundExistential]);"
    "var e = passClassBoundExistentialThrough(instance);"
    "send(ClassOnlyExistentialClass.$metadataPointer.equals(e.$metadata.handle));"
    "send(e.handle.add(0x10).readU64() == 0xAAAAAAAA);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (class_existential_multiple_conformances_can_be_passed_to_and_rerturned_from_function)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var CompositeClassBoundExistentialClass = Swift.classes.CompositeClassBoundExistentialClass;"
    "var initPtr = CompositeClassBoundExistentialClass.$methods[CompositeClassBoundExistentialClass.$methods.length - 1].address;"
    "var init = Swift.NativeFunction(initPtr, CompositeClassBoundExistentialClass, [], CompositeClassBoundExistentialClass.$metadataPointer);"
    "var instance = init();"
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy41passCompositeClassBoundExistentialThroughyAA0deF0_AA0F0pAaC_AaDpF');"
    "var target = symbols[0].address;"
    "var ClassBoundExistential = Swift.protocols.ClassBoundExistential;"
    "var Togglable = Swift.protocols.Togglable;"
    "var ClassBoundExistentialAndTogglable = new Swift.ProtocolComposition(ClassBoundExistential, Togglable);"
    "var passCompositeClassBoundExistentialThrough = Swift.NativeFunction(target, ClassBoundExistentialAndTogglable, [ClassBoundExistentialAndTogglable]);"
    "var result = passCompositeClassBoundExistentialThrough(instance);"
    "send(result.$metadata.handle.equals(CompositeClassBoundExistentialClass.$metadataPointer));"
    "send(result.handle.add(2 * Process.pointerSize).readU64() == 0x0B00B135);"
    "send(result.handle.add(3 * Process.pointerSize).readU64() == 0xB16B00B5);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (c_style_enum_can_be_made_from_raw)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var CStyle = Swift.enums.CStyle;"
    "var b = new Swift.Enum(CStyle, { raw: [1] });"
    "send(b.$tag === 1);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (c_style_enum_cases_can_be_gotten)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var CStyle = Swift.enums.CStyle;"
    "var b = CStyle.b;"
    "send(b.$tag === 1);"
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
    "var a = new Swift.Enum(SinglePayloadEnumWithNoExtraInhabitants, { handle: rawA });"
    "send(a.$tag === 1);"
    "rawA = Memory.alloc(16);"
    "var SinglePayloadEnumWithExtraInhabitants = Swift.enums.SinglePayloadEnumWithExtraInhabitants;"
    "a = new Swift.Enum(SinglePayloadEnumWithExtraInhabitants, { handle: rawA });"
    "send(a.$tag === 1);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (singlepayload_enum_empty_case_can_be_gotten)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var SinglePayloadEnumWithNoExtraInhabitants = Swift.enums.SinglePayloadEnumWithNoExtraInhabitants;"
    "var d = SinglePayloadEnumWithNoExtraInhabitants.d;"
    "send(d.$tag === 4);"
    "var SinglePayloadEnumWithExtraInhabitants = Swift.enums.SinglePayloadEnumWithExtraInhabitants;"
    "var c = SinglePayloadEnumWithExtraInhabitants.c;"
    "send(c.$tag === 3);"
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
    "var some = new Swift.Enum(SinglePayloadEnumWithNoExtraInhabitants, { handle: rawSome });"
    "send(some.$tag === 0);"
    "var SinglePayloadEnumWithExtraInhabitants = Swift.enums.SinglePayloadEnumWithExtraInhabitants;"
    "rawSome = Memory.alloc(16);"
    "rawSome.writeByteArray([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe5]);"
    "some = new Swift.Enum(SinglePayloadEnumWithExtraInhabitants, { handle: rawSome });"
    "send(some.$tag === 0);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (singlepayload_enum_data_case_can_be_made_ad_hoc)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var Int = Swift.structs.Int;"
    "var zero = new Swift.Struct(Int, { raw: [0] });"
    "var SinglePayloadEnumWithNoExtraInhabitants = Swift.enums.SinglePayloadEnumWithNoExtraInhabitants;"
    "var i = SinglePayloadEnumWithNoExtraInhabitants.Some(zero);"
    "send(i.$payload.handle.readU64().toNumber() == zero.handle.readU64().toNumber());"
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
  EXPECT_SEND_MESSAGE_WITH ("false");
  EXPECT_SEND_MESSAGE_WITH ("false");
}

TESTCASE (multipayload_enum_empty_case_can_be_made_from_raw)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var rawF = Memory.alloc(24);"
    "rawF.writeU8(1);"
    "rawF.add(0x10).writeU8(4);"
    "var MultiPayloadEnum = Swift.enums.MultiPayloadEnum;"
    "var f = new Swift.Enum(MultiPayloadEnum, { handle: rawF });"
    "send(f.$tag === 5);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (multipayload_enum_empty_case_can_be_gotten)
{
  COMPILE_AND_LOAD_SCRIPT (
    "var MultiPayloadEnum = Swift.enums.MultiPayloadEnum;"
    "send(MultiPayloadEnum.e.$tag === 4);"
    "send(MultiPayloadEnum.f.$tag === 5);"
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
    "var b = new Swift.Enum(MultiPayloadEnum, { handle: rawB });"
    "send(b.$tag === 1);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (multipayload_enum_data_case_can_be_made_ad_hoc)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var buf = Memory.alloc(8);"
    "buf.writeU64(0xCAFE);"
    "var Int = Swift.structs.Int;"
    "var i = new Swift.Struct(Int, { handle: buf });"
    "var MultiPayloadEnum = Swift.enums.MultiPayloadEnum;"
    "var a = MultiPayloadEnum.a(i);"
    "send(a.$tag === 0);"
    "send(a.$payload.handle.readU64() == 0xCAFE);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (multipayload_enum_equals_works)
{
  COMPILE_AND_LOAD_SCRIPT(
    "var MultiPayloadEnum = Swift.enums.MultiPayloadEnum;"
    "send(MultiPayloadEnum.e.equals(MultiPayloadEnum.f));"
    "var Int = Swift.structs.Int;"
    "var i1 = new Swift.Struct(Int, { raw: [0xCAFE] });"
    "var MultiPayloadEnum = Swift.enums.MultiPayloadEnum;"
    "var a1 = MultiPayloadEnum.a(i1);"
    "var i2 = new Swift.Struct(Int, { raw: [0xBABE] });"
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
    "var hasHashable = 'Hashable' in URL.$conformances;"
    "send(hasHashable);"
    "var OnOffSwitch = Swift.enums.OnOffSwitch;"
    "var hasTogglable = 'Togglable' in OnOffSwitch.$conformances;"
    "send(hasTogglable);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (interceptor_can_parse_struct_value_arguments)
{
  COMPILE_AND_LOAD_SCRIPT (
    "var { Int } = Swift.structs;"
    "var i1 = new Swift.Struct(Int, { raw: [1] });"
    "var i2 = new Swift.Struct(Int, { raw: [2] });"
    "var { SimpleClass } = Swift.classes;"
    "Swift.Interceptor.attach(SimpleClass.__allocating_init$first_second_.address, {"
      "onEnter: function(args) {"
        "send(args[0].handle.readU64() == 1);"
        "send(args[1].handle.readU64() == 2);"
      "}"
    "});"
    "SimpleClass.__allocating_init$first_second_(i1, i2);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (interceptor_can_parse_enum_value_arguments)
{
  COMPILE_AND_LOAD_SCRIPT (
    "var { Int } = Swift.structs;"
    "var i1 = new Swift.Struct(Int, { raw: [1] });"
    "var i2 = new Swift.Struct(Int, { raw: [2] });"
    "var { SimpleClass } = Swift.classes;"
    "var instance = SimpleClass.__allocating_init$first_second_(i1, i2);"
    "var { OnOffSwitch } = Swift.enums;"
    "Swift.Interceptor.attach(instance.printValue$for_.address, {"
      "onEnter: function(args) {"
          "send(args[0].equals(OnOffSwitch.on));"
      "}"
    "});"
    "instance.printValue$for_(OnOffSwitch.on);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (interceptor_can_parse_class_instance_arguments)
{
  COMPILE_AND_LOAD_SCRIPT (
    "var { Int } = Swift.structs;"
    "var i1 = new Swift.Struct(Int, { raw: [1] });"
    "var i2 = new Swift.Struct(Int, { raw: [2] });"
    "var { SimpleClass, EmptyClass } = Swift.classes;"
    "var simple = SimpleClass.__allocating_init$first_second_(i1, i2);"
    "var empty = EmptyClass.__allocating_init();"
    "Swift.Interceptor.attach(simple.doNothing$with_.address, {"
      "onEnter: function(args) {"
        "send(args[0].$metadata.handle.equals(EmptyClass.$metadataPointer));"
      "}"
    "});"
    "simple.doNothing$with_(empty);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (interceptor_can_parse_stack_arguments)
{
  COMPILE_AND_LOAD_SCRIPT (
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy30makeBigStructWithManyArguments4with3and1a1b1c1d1eAA0cD0VAA08LoadableD0V_AMS5itF');"
    "var target = symbols[0].address;"
    "var { BigStruct, LoadableStruct, Int } = Swift.structs;"
    "var makeBigStructWithManyArguments = Swift.NativeFunction(target, BigStruct, [LoadableStruct, LoadableStruct, Int, Int, Int, Int, Int]);"
    "var i1 = new Swift.Struct(Int, { raw: [1] });"
    "var i2 = new Swift.Struct(Int, { raw: [2] });"
    "var i3 = new Swift.Struct(Int, { raw: [3] });"
    "var i4 = new Swift.Struct(Int, { raw: [4] });"
    "var i5 = new Swift.Struct(Int, { raw: [5] });"
    "var loadable = new Swift.Struct(LoadableStruct, { raw: [0xA, 0xB, 0xC, 0xD] });"
    "Swift.Interceptor.attach(makeBigStructWithManyArguments.address, {"
        "onEnter: function(args) {"
            "send(args[0].$metadata.handle.equals(LoadableStruct.$metadataPointer));"
            "send(args[0].handle.readU64().toNumber() == 0xA);"
            "send(args[0].handle.add(Process.pointerSize).readU64().toNumber() == 0xB);"
            "send(args[0].handle.add(Process.pointerSize * 2).readU64().toNumber() == 0xC);"
            "send(args[0].handle.add(Process.pointerSize * 3).readU64().toNumber() == 0xD);"

            "send(args[1].$metadata.handle.equals(LoadableStruct.$metadataPointer));"
            "send(args[1].handle.readU64().toNumber() == 0xA);"
            "send(args[1].handle.add(Process.pointerSize).readU64().toNumber() == 0xB);"
            "send(args[1].handle.add(Process.pointerSize * 2).readU64().toNumber() == 0xC);"
            "send(args[1].handle.add(Process.pointerSize * 3).readU64().toNumber() == 0xD);"

            "send(args[2].$metadata.handle.equals(Int.$metadataPointer));"
            "send(args[2].handle.readU64().toNumber() == 1);"

            "send(args[3].$metadata.handle.equals(Int.$metadataPointer));"
            "send(args[3].handle.readU64().toNumber() == 2);"

            "send(args[4].$metadata.handle.equals(Int.$metadataPointer));"
            "send(args[4].handle.readU64().toNumber() == 3);"

            "send(args[5].$metadata.handle.equals(Int.$metadataPointer));"
            "send(args[5].handle.readU64().toNumber() == 4);"

            "send(args[6].$metadata.handle.equals(Int.$metadataPointer));"
            "send(args[6].handle.readU64().toNumber() == 5);"
        "},"
        "onLeave: function(retval) {"
            "send(retval.$metadata.handle.equals(BigStruct.$metadataPointer));"
            "send(retval.handle.readU64().toNumber() == 0x15);"
            "send(retval.handle.add(Process.pointerSize).readU64().toNumber() == 0x18);"
            "send(retval.handle.add(Process.pointerSize * 2).readU64().toNumber() == 0x1B);"
            "send(retval.handle.add(Process.pointerSize * 3).readU64().toNumber() == 0x1E);"
            "send(retval.handle.add(Process.pointerSize * 4).readU64().toNumber() == 0x05);"
        "}"
    "});"
    "makeBigStructWithManyArguments(loadable, loadable, i1, i2, i3, i4, i5);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (interceptor_can_parse_opaque_existential_container_arguments)
{
  COMPILE_AND_LOAD_SCRIPT (
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy27takeInlineExistentialStructySbAA0D0_pF');"
    "var target = symbols[0].address;"
    "var { Existential } = Swift.protocols;"
    "var takeInLineExistentialStruct = Swift.NativeFunction(target, 'void', [Existential]);"
    "var { InlineExistentialStruct, OutOfLineExistentialStruct } = Swift.structs;"
    "var inline = new Swift.Struct(InlineExistentialStruct, { raw: [0xDEAD, 0xBABE] });"
    "Swift.Interceptor.attach(takeInLineExistentialStruct.address, {"
        "onEnter: function(args) {"
            "send(args[0].$metadata.handle.equals(InlineExistentialStruct.$metadataPointer));"
            "send(args[0].handle.readU64().toNumber() == 0xDEAD);"
            "send(args[0].handle.add(Process.pointerSize).readU64().toNumber() == 0xBABE);"
        "}"
    "});"
    "takeInLineExistentialStruct(inline);"

    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy30takeOutOfLineExistentialStructySbAA0F0_pF');"
    "var target = symbols[0].address;"
    "var takeOutOfLineExistentialStruct = Swift.NativeFunction(target, 'void', [Existential]);"
    "var outOfLine = new Swift.Struct(OutOfLineExistentialStruct, { raw: [0xDEAD, 0xBEEF, 0xAAAA, 0xBBBB, 0xCCCC] });"
    "Swift.Interceptor.attach(takeOutOfLineExistentialStruct.address, {"
        "onEnter: function(args) {"
            "send(args[0].$metadata.handle.equals(OutOfLineExistentialStruct.$metadataPointer));"
            "send(args[0].handle.readU64().toNumber() == 0xDEAD);"
            "send(args[0].handle.add(Process.pointerSize).readU64().toNumber() == 0xBEEF);"
        "}"
    "});"
    "takeOutOfLineExistentialStruct(outOfLine);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (interceptor_can_parse_class_existential_container_arguments)
{
  COMPILE_AND_LOAD_SCRIPT (
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy32passClassBoundExistentialThroughyAA0cdE0_pAaC_pF');"
    "var target = symbols[0].address;"
    "var { ClassBoundExistential } = Swift.protocols;"
    "var passClassBoundExistentialThrough = Swift.NativeFunction(target, ClassBoundExistential, [ClassBoundExistential]);"
    "var { ClassOnlyExistentialClass } = Swift.classes;"
    "var instance = ClassOnlyExistentialClass.__allocating_init();"
    "Swift.Interceptor.attach(passClassBoundExistentialThrough.address, {"
        "onEnter: function(args) {"
            "const arg0 = args[0];"
            "send(arg0.$metadata.handle.equals(ClassOnlyExistentialClass.$metadataPointer));"
            "send(arg0.handle.add(Process.pointerSize * 2).readU64().toNumber() == 0xAAAAAAAA);"
            "send(arg0.handle.add(Process.pointerSize * 3).readU64().toNumber() == 0xBBBBBBBB);"
        "}"
    "});"
    "passClassBoundExistentialThrough(instance);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (interceptor_can_parse_direct_return_value)
{
  COMPILE_AND_LOAD_SCRIPT (
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy17getLoadableStructAA0cD0VyF');"
    "var target = symbols[0].address;"
    "var { LoadableStruct } = Swift.structs;"
    "var getLoadableStruct = Swift.NativeFunction(target, LoadableStruct, []);"
    "Swift.Interceptor.attach(getLoadableStruct.address, {"
        "onLeave: function(retval) {"
            "const intercepted = retval;"
            "send(intercepted.$metadata.handle.equals(LoadableStruct.$metadataPointer));"
            "send(intercepted.handle.readU64().toNumber() == 0x1);"
            "send(intercepted.handle.add(Process.pointerSize).readU64().toNumber() == 0x2);"
            "send(intercepted.handle.add(Process.pointerSize * 2).readU64().toNumber() == 0x3);"
            "send(intercepted.handle.add(Process.pointerSize * 3).readU64().toNumber() == 0x4);"
        "}"
    "});"
    "getLoadableStruct();"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (interceptor_can_parse_indirect_return_value)
{
  COMPILE_AND_LOAD_SCRIPT (
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy15returnBigStructAA0cD0VyF');"
    "var target = symbols[0].address;"
    "var { BigStruct } = Swift.structs;"
    "var returnBigStruct = Swift.NativeFunction(target, BigStruct, []);"
    "Swift.Interceptor.attach(returnBigStruct.address, {"
        "onLeave: function(retval) {"
            "const intercepted = retval;"
            "send(intercepted.$metadata.handle.equals(BigStruct.$metadataPointer));"
            "send(intercepted.handle.readU64().toNumber() == 0x1);"
            "send(intercepted.handle.add(Process.pointerSize).readU64().toNumber() == 0x2);"
            "send(intercepted.handle.add(Process.pointerSize * 2).readU64().toNumber() == 0x3);"
            "send(intercepted.handle.add(Process.pointerSize * 3).readU64().toNumber() == 0x4);"
            "send(intercepted.handle.add(Process.pointerSize * 4).readU64().toNumber() == 0x5);"
        "}"
    "});"
    "returnBigStruct();"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (interceptor_can_parse_opaque_existential_container_return_value)
{
  COMPILE_AND_LOAD_SCRIPT (
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy22passThroughExistentialyAA0D0_pAaC_pF');"
    "var target = symbols[0].address;"
    "var { Existential } = Swift.protocols;"
    "var passThroughExistential = Swift.NativeFunction(target, Existential, [Existential]);"
    "var { InlineExistentialStruct, OutOfLineExistentialStruct } = Swift.structs;"
    "var hook = Swift.Interceptor.attach(passThroughExistential.address, {"
        "onLeave: function(retval) {"
            "send(retval.$metadata.handle.equals(InlineExistentialStruct.$metadataPointer));"
            "send(retval.handle.readU64().toNumber() == 0xDEAD);"
            "send(retval.handle.add(Process.pointerSize).readU64().toNumber() == 0xBABE);"
        "}"
    "});"
    "var inline = new Swift.Struct(InlineExistentialStruct, { raw: [0xDEAD, 0xBABE] });"
    "passThroughExistential(inline);"
    "hook.detach();"
    "var outOfLine = new Swift.Struct(OutOfLineExistentialStruct, { raw: [0xDEAD, 0xBEEF, 0xAAAA, 0xBBBB, 0xCCCC] });"
    "Swift.Interceptor.attach(passThroughExistential.address, {"
        "onLeave: function(retval) {"
            "send(retval.$metadata.handle.equals(OutOfLineExistentialStruct.$metadataPointer));"
            "send(retval.handle.readU64().toNumber() == 0xDEAD);"
            "send(retval.handle.add(Process.pointerSize).readU64().toNumber() == 0xBEEF);"
            "send(retval.handle.add(Process.pointerSize * 2).readU64().toNumber() == 0xAAAA);"
            "send(retval.handle.add(Process.pointerSize * 3).readU64().toNumber() == 0xBBBB);"
            "send(retval.handle.add(Process.pointerSize * 4).readU64().toNumber() == 0xCCCC);"
        "}"
    "});"
    "passThroughExistential(outOfLine);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}

TESTCASE (interceptor_can_parse_class_existential_container_return_value)
{
  COMPILE_AND_LOAD_SCRIPT (
    "var dummy = Process.getModuleByName('dummy.o');"
    "var symbols = dummy.enumerateSymbols();"
    "symbols = symbols.filter(s => s.name == '$s5dummy41passCompositeClassBoundExistentialThroughyAA0deF0_AA0F0pAaC_AaDpF');"
    "var target = symbols[0].address;"
    "var { ClassBoundExistential, Togglable } = Swift.protocols;"
    "var ClassBoundExistentialAndTogglable = new Swift.ProtocolComposition(ClassBoundExistential, Togglable);"
    "var passCompositeClassBoundExistentialThrough = Swift.NativeFunction(target, ClassBoundExistentialAndTogglable, [ClassBoundExistentialAndTogglable]);"
    "var { CompositeClassBoundExistentialClass } = Swift.classes;"
    "var instance = CompositeClassBoundExistentialClass.__allocating_init();"
    "Swift.Interceptor.attach(passCompositeClassBoundExistentialThrough.address, {"
        "onLeave: function(retval) {"
            "send(retval.$metadata.handle.equals(CompositeClassBoundExistentialClass.$metadataPointer));"
            "send(retval.handle.add(Process.pointerSize * 2).readU64().toNumber() == 0x0B00B135);"
            "send(retval.handle.add(Process.pointerSize * 3).readU64().toNumber() == 0xB16B00B5);"
        "}"
    "});"
    "passCompositeClassBoundExistentialThrough(instance);"
  );
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
  EXPECT_SEND_MESSAGE_WITH ("true");
}
