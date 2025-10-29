use super::extract_value_from_transcript;
use crate::Handler;
use serde_json::json;

const SAMPLE_REQUEST: &str = "GET /api/test HTTP/1.1\r\n\
    Host: example.com\r\n\
    Content-Type: application/json\r\n\
    \r\n\
    {\"name\":\"John\",\"age\":30}";

const SAMPLE_RESPONSE: &str = "HTTP/1.1 200 OK\r\n\
    Date: Tue, 28 Oct 2025 14:46:24 GMT\r\n\
    Content-Type: application/json\r\n\
    \r\n\
    {\"screen_name\":\"test_user\",\"protected\":false}";

#[test]
fn test_extract_start_line_request() {
    let handler = Handler {
        handler_type: "SENT".to_string(),
        part: "START_LINE".to_string(),
        action: "REVEAL".to_string(),
        params: None,
    };

    let result = extract_value_from_transcript(SAMPLE_REQUEST, &handler).unwrap();
    assert_eq!(result, "GET /api/test HTTP/1.1");
}

#[test]
fn test_extract_start_line_response() {
    let handler = Handler {
        handler_type: "RECV".to_string(),
        part: "START_LINE".to_string(),
        action: "REVEAL".to_string(),
        params: None,
    };

    let result = extract_value_from_transcript(SAMPLE_RESPONSE, &handler).unwrap();
    assert_eq!(result, "HTTP/1.1 200 OK");
}

#[test]
fn test_extract_method() {
    let handler = Handler {
        handler_type: "SENT".to_string(),
        part: "METHOD".to_string(),
        action: "REVEAL".to_string(),
        params: None,
    };

    let result = extract_value_from_transcript(SAMPLE_REQUEST, &handler).unwrap();
    assert_eq!(result, "GET");
}

#[test]
fn test_extract_protocol() {
    let handler = Handler {
        handler_type: "SENT".to_string(),
        part: "PROTOCOL".to_string(),
        action: "REVEAL".to_string(),
        params: None,
    };

    let result = extract_value_from_transcript(SAMPLE_REQUEST, &handler).unwrap();
    assert_eq!(result, "HTTP/1.1");
}

#[test]
fn test_extract_request_target() {
    let handler = Handler {
        handler_type: "SENT".to_string(),
        part: "REQUEST_TARGET".to_string(),
        action: "REVEAL".to_string(),
        params: None,
    };

    let result = extract_value_from_transcript(SAMPLE_REQUEST, &handler).unwrap();
    assert_eq!(result, "/api/test");
}

#[test]
fn test_extract_status_code() {
    let handler = Handler {
        handler_type: "RECV".to_string(),
        part: "STATUS_CODE".to_string(),
        action: "REVEAL".to_string(),
        params: None,
    };

    let result = extract_value_from_transcript(SAMPLE_RESPONSE, &handler).unwrap();
    assert_eq!(result, "200");
}

#[test]
fn test_extract_header_full() {
    let handler = Handler {
        handler_type: "RECV".to_string(),
        part: "HEADERS".to_string(),
        action: "REVEAL".to_string(),
        params: Some(json!({
            "key": "Date"
        })),
    };

    let result = extract_value_from_transcript(SAMPLE_RESPONSE, &handler).unwrap();
    assert_eq!(result, "Date: Tue, 28 Oct 2025 14:46:24 GMT");
}

#[test]
fn test_extract_header_value_only() {
    let handler = Handler {
        handler_type: "RECV".to_string(),
        part: "HEADERS".to_string(),
        action: "REVEAL".to_string(),
        params: Some(json!({
            "key": "Date",
            "hideKey": true
        })),
    };

    let result = extract_value_from_transcript(SAMPLE_RESPONSE, &handler).unwrap();
    assert_eq!(result, "Tue, 28 Oct 2025 14:46:24 GMT");
}

#[test]
fn test_extract_header_key_only() {
    let handler = Handler {
        handler_type: "RECV".to_string(),
        part: "HEADERS".to_string(),
        action: "REVEAL".to_string(),
        params: Some(json!({
            "key": "Date",
            "hideValue": true
        })),
    };

    let result = extract_value_from_transcript(SAMPLE_RESPONSE, &handler).unwrap();
    assert_eq!(result, "Date");
}

#[test]
fn test_extract_json_field_full() {
    let handler = Handler {
        handler_type: "RECV".to_string(),
        part: "BODY".to_string(),
        action: "REVEAL".to_string(),
        params: Some(json!({
            "type": "json",
            "path": "screen_name"
        })),
    };

    let result = extract_value_from_transcript(SAMPLE_RESPONSE, &handler).unwrap();
    assert_eq!(result, "\"screen_name\": \"test_user\"");
}

#[test]
fn test_extract_json_field_value_only() {
    let handler = Handler {
        handler_type: "RECV".to_string(),
        part: "BODY".to_string(),
        action: "REVEAL".to_string(),
        params: Some(json!({
            "type": "json",
            "path": "screen_name",
            "hideKey": true
        })),
    };

    let result = extract_value_from_transcript(SAMPLE_RESPONSE, &handler).unwrap();
    assert_eq!(result, "\"test_user\"");
}

#[test]
fn test_extract_json_field_key_only() {
    let handler = Handler {
        handler_type: "RECV".to_string(),
        part: "BODY".to_string(),
        action: "REVEAL".to_string(),
        params: Some(json!({
            "type": "json",
            "path": "screen_name",
            "hideValue": true
        })),
    };

    let result = extract_value_from_transcript(SAMPLE_RESPONSE, &handler).unwrap();
    assert_eq!(result, "\"screen_name\"");
}

#[test]
fn test_extract_full_body() {
    let handler = Handler {
        handler_type: "RECV".to_string(),
        part: "BODY".to_string(),
        action: "REVEAL".to_string(),
        params: None,
    };

    let result = extract_value_from_transcript(SAMPLE_RESPONSE, &handler).unwrap();
    assert_eq!(result, "{\"screen_name\":\"test_user\",\"protected\":false}");
}
