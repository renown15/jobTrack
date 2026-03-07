from jobtrack_navigator_ai.providers import (
    _assemble_response_tokens_from_text,
    _extract_json_objects_from_text,
)


def test_extract_json_objects_simple_concat():
    text = '{"a":1}{"b":2}'
    objs = _extract_json_objects_from_text(text)
    assert len(objs) == 2
    assert objs[0] == '{"a":1}'
    assert objs[1] == '{"b":2}'


def test_extract_json_objects_with_nested_braces():
    text = '{"x": {"y": "value"}} some text {"z":3}'
    objs = _extract_json_objects_from_text(text)
    assert len(objs) == 2
    assert objs[0].startswith('{"x":')
    assert objs[1].startswith('{"z":')


def test_assemble_response_tokens_from_text_brace_and_ndjson():
    text = '{"response":"Hello"}{"response":", world"}\n{"response":" How are you?"}\n'
    assembled = _assemble_response_tokens_from_text(text)
    # First piece 'Hello' + second piece starting with punctuation should be joined without extra space
    # then the third piece starts with space so should be concatenated with a space
    assert assembled == "Hello, world How are you?"


def test_assemble_response_tokens_from_text_empty_returns_empty():
    assert _assemble_response_tokens_from_text("") == ""
