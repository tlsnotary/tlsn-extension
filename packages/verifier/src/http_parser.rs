use crate::Handler;
use eyre::{eyre, Result};
use serde_json::Value as JsonValue;

/// Parse HTTP request/response and extract value according to handler
pub fn extract_value_from_transcript(
    transcript: &str,
    handler: &Handler,
) -> Result<String> {
    // Determine if this is a request or response based on first line
    let is_request = transcript.starts_with("GET ")
        || transcript.starts_with("POST ")
        || transcript.starts_with("PUT ")
        || transcript.starts_with("DELETE ")
        || transcript.starts_with("HEAD ")
        || transcript.starts_with("OPTIONS ")
        || transcript.starts_with("PATCH ");

    match handler.part.as_str() {
        "START_LINE" => extract_start_line(transcript),
        "PROTOCOL" => extract_protocol(transcript),
        "METHOD" => extract_method(transcript),
        "REQUEST_TARGET" => extract_request_target(transcript),
        "STATUS_CODE" => extract_status_code(transcript),
        "HEADERS" => {
            if let Some(params) = &handler.params {
                extract_header(transcript, params)
            } else {
                Ok(transcript.to_string())
            }
        }
        "BODY" => {
            if let Some(params) = &handler.params {
                extract_body(transcript, params)
            } else {
                extract_full_body(transcript)
            }
        }
        _ => Err(eyre!("Unknown handler part: {}", handler.part)),
    }
}

fn extract_start_line(transcript: &str) -> Result<String> {
    transcript
        .lines()
        .next()
        .map(|line| line.to_string())
        .ok_or_else(|| eyre!("No start line found"))
}

fn extract_protocol(transcript: &str) -> Result<String> {
    let start_line = extract_start_line(transcript)?;
    start_line
        .split_whitespace()
        .last()
        .map(|s| s.to_string())
        .ok_or_else(|| eyre!("No protocol found in start line"))
}

fn extract_method(transcript: &str) -> Result<String> {
    let start_line = extract_start_line(transcript)?;
    start_line
        .split_whitespace()
        .next()
        .map(|s| s.to_string())
        .ok_or_else(|| eyre!("No method found in start line"))
}

fn extract_request_target(transcript: &str) -> Result<String> {
    let start_line = extract_start_line(transcript)?;
    let parts: Vec<&str> = start_line.split_whitespace().collect();
    if parts.len() >= 2 {
        Ok(parts[1].to_string())
    } else {
        Err(eyre!("No request target found in start line"))
    }
}

fn extract_status_code(transcript: &str) -> Result<String> {
    let start_line = extract_start_line(transcript)?;
    let parts: Vec<&str> = start_line.split_whitespace().collect();
    if parts.len() >= 2 {
        Ok(parts[1].to_string())
    } else {
        Err(eyre!("No status code found in start line"))
    }
}

fn extract_header(transcript: &str, params: &JsonValue) -> Result<String> {
    let key = params
        .get("key")
        .and_then(|v| v.as_str())
        .ok_or_else(|| eyre!("No key specified for HEADERS handler"))?;

    let hide_key = params
        .get("hideKey")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let hide_value = params
        .get("hideValue")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    // Find the header line (case-insensitive)
    for line in transcript.lines() {
        if line.is_empty() {
            break; // End of headers
        }

        if let Some((header_name, header_value)) = line.split_once(':') {
            if header_name.trim().eq_ignore_ascii_case(key) {
                let value = header_value.trim();

                if hide_key && hide_value {
                    return Err(eyre!("Cannot hide both key and value"));
                } else if hide_key {
                    return Ok(value.to_string());
                } else if hide_value {
                    return Ok(header_name.trim().to_string());
                } else {
                    return Ok(format!("{}: {}", header_name.trim(), value));
                }
            }
        }
    }

    Err(eyre!("Header '{}' not found", key))
}

fn extract_full_body(transcript: &str) -> Result<String> {
    // Find the empty line that separates headers from body
    let mut in_body = false;
    let mut body_lines = Vec::new();

    for line in transcript.lines() {
        if in_body {
            body_lines.push(line);
        } else if line.is_empty() {
            in_body = true;
        }
    }

    Ok(body_lines.join("\n"))
}

fn extract_body(transcript: &str, params: &JsonValue) -> Result<String> {
    let body = extract_full_body(transcript)?;

    let body_type = params
        .get("type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| eyre!("No type specified for BODY handler"))?;

    match body_type {
        "json" => {
            let path = params
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| eyre!("No path specified for json BODY handler"))?;

            let hide_key = params
                .get("hideKey")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let hide_value = params
                .get("hideValue")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            extract_json_field(&body, path, hide_key, hide_value)
        }
        "regex" => {
            let regex_str = params
                .get("regex")
                .and_then(|v| v.as_str())
                .ok_or_else(|| eyre!("No regex specified for regex BODY handler"))?;

            // For now, return the full body - proper regex matching would require the regex crate
            Ok(body)
        }
        _ => Err(eyre!("Unknown body type: {}", body_type)),
    }
}

fn extract_json_field(
    json_str: &str,
    path: &str,
    hide_key: bool,
    hide_value: bool,
) -> Result<String> {
    let json: JsonValue = serde_json::from_str(json_str)
        .map_err(|e| eyre!("Failed to parse JSON: {}", e))?;

    let value = json
        .get(path)
        .ok_or_else(|| eyre!("JSON field '{}' not found", path))?;

    if hide_key && hide_value {
        return Err(eyre!("Cannot hide both key and value"));
    } else if hide_key {
        // Return only the value
        Ok(serde_json::to_string(value)?)
    } else if hide_value {
        // Return only the key
        Ok(format!("\"{}\"", path))
    } else {
        // Return key-value pair
        Ok(format!("\"{}\": {}", path, serde_json::to_string(value)?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
}
