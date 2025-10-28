use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use futures_util::{SinkExt, StreamExt};

/// Test the WebSocket-to-TCP proxy end-to-end
#[tokio::test]
async fn test_proxy_endpoint_integration() {
    println!("\n=== Starting Proxy Integration Test ===\n");

    // Step 1: Start a simple TCP echo server
    let echo_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let echo_addr = echo_listener.local_addr().unwrap();
    let echo_port = echo_addr.port();
    println!("✓ Echo server listening on {}", echo_addr);

    // Spawn the echo server
    tokio::spawn(async move {
        loop {
            match echo_listener.accept().await {
                Ok((mut socket, addr)) => {
                    println!("  Echo: accepted connection from {}", addr);

                    tokio::spawn(async move {
                        let mut buf = vec![0u8; 1024];
                        let mut total_echoed = 0;

                        loop {
                            match socket.read(&mut buf).await {
                                Ok(0) => {
                                    println!("  Echo: connection closed (echoed {} bytes total)", total_echoed);
                                    break;
                                }
                                Ok(n) => {
                                    total_echoed += n;
                                    println!("  Echo: received {} bytes, echoing back", n);
                                    if let Err(e) = socket.write_all(&buf[..n]).await {
                                        println!("  Echo: write error: {}", e);
                                        break;
                                    }
                                }
                                Err(e) => {
                                    println!("  Echo: read error: {}", e);
                                    break;
                                }
                            }
                        }
                    });
                }
                Err(e) => {
                    println!("  Echo: accept error: {}", e);
                    break;
                }
            }
        }
    });

    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

    // Step 2: Start a minimal WebSocket proxy server
    let proxy_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let proxy_addr = proxy_listener.local_addr().unwrap();
    println!("✓ Proxy server listening on {}", proxy_addr);

    let echo_host = format!("127.0.0.1:{}", echo_port);
    let echo_host_for_spawn = echo_host.clone();

    tokio::spawn(async move {
        while let Ok((stream, client_addr)) = proxy_listener.accept().await {
            println!("  Proxy: accepted WebSocket connection from {}", client_addr);
            let echo_host = echo_host_for_spawn.clone();

            tokio::spawn(async move {
                // Accept WebSocket upgrade
                match tokio_tungstenite::accept_async(stream).await {
                    Ok(ws) => {
                        println!("  Proxy: WebSocket handshake completed");
                        handle_proxy_test(ws, echo_host).await;
                    }
                    Err(e) => {
                        println!("  Proxy: WebSocket handshake failed: {}", e);
                    }
                }
            });
        }
    });

    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

    // Step 3: Connect WebSocket client to proxy
    let ws_url = format!("ws://{}/proxy", proxy_addr);
    println!("✓ Connecting WebSocket client to {}", ws_url);

    let (ws_stream, _) = connect_async(&ws_url).await.unwrap();
    let (mut ws_write, mut ws_read) = ws_stream.split();
    println!("✓ WebSocket connection established");

    // Step 4: Send test data through WebSocket -> TCP
    let test_messages = vec![
        b"Hello from WebSocket!".to_vec(),
        b"Second message".to_vec(),
        b"Final test".to_vec(),
    ];

    for (i, test_data) in test_messages.iter().enumerate() {
        println!("\n--- Test Message {} ---", i + 1);
        println!("  Client: sending {} bytes: {:?}", test_data.len(), String::from_utf8_lossy(test_data));

        // Send binary message
        ws_write.send(Message::Binary(test_data.clone())).await.unwrap();
        println!("  Client: sent binary frame");

        // Receive echo back
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        if let Some(Ok(Message::Binary(response))) = ws_read.next().await {
            println!("  Client: received {} bytes: {:?}", response.len(), String::from_utf8_lossy(&response));
            assert_eq!(test_data, &response, "Message {} should echo back correctly", i + 1);
            println!("  ✓ Message {} echoed correctly!", i + 1);
        } else {
            panic!("Expected binary message response for message {}", i + 1);
        }
    }

    println!("\n✅ All proxy tests passed!\n");
}

/// Simplified proxy handler for testing
async fn handle_proxy_test(ws: tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>, host: String) {
    use futures_util::{SinkExt, StreamExt};

    println!("  Proxy Handler: connecting to TCP host: {}", host);

    // Connect to TCP host
    let tcp_stream = match tokio::net::TcpStream::connect(&host).await {
        Ok(stream) => {
            println!("  Proxy Handler: TCP connection established");
            stream
        }
        Err(e) => {
            println!("  Proxy Handler: TCP connection failed: {}", e);
            return;
        }
    };

    // Split streams
    let (mut ws_sink, mut ws_stream) = ws.split();
    let (mut tcp_read, mut tcp_write) = tokio::io::split(tcp_stream);

    // Forward WebSocket -> TCP
    let ws_to_tcp = tokio::spawn(async move {
        let mut count = 0;
        while let Some(Ok(msg)) = ws_stream.next().await {
            if let Message::Binary(data) = msg {
                count += 1;
                println!("  Proxy: WS->TCP forwarding {} bytes (message #{})", data.len(), count);
                if tcp_write.write_all(&data).await.is_err() {
                    println!("  Proxy: WS->TCP write failed");
                    break;
                }
            }
        }
        println!("  Proxy: WS->TCP closed (forwarded {} messages)", count);
    });

    // Forward TCP -> WebSocket
    let tcp_to_ws = tokio::spawn(async move {
        let mut buf = vec![0u8; 8192];
        let mut count = 0;
        loop {
            match tcp_read.read(&mut buf).await {
                Ok(0) => {
                    println!("  Proxy: TCP->WS EOF (forwarded {} chunks)", count);
                    break;
                }
                Ok(n) => {
                    count += 1;
                    println!("  Proxy: TCP->WS forwarding {} bytes (chunk #{})", n, count);
                    let msg = Message::Binary(buf[..n].to_vec());
                    if ws_sink.send(msg).await.is_err() {
                        println!("  Proxy: TCP->WS write failed");
                        break;
                    }
                }
                Err(e) => {
                    println!("  Proxy: TCP->WS read error: {}", e);
                    break;
                }
            }
        }
    });

    let _ = tokio::join!(ws_to_tcp, tcp_to_ws);
    println!("  Proxy Handler: connection closed");
}

/// Test real HTTP request through proxy
/// Note: This uses httpbin.org which supports plain HTTP
/// For HTTPS (like swapi.dev), the CLIENT must handle TLS encryption
/// The proxy only forwards raw TCP bytes
#[tokio::test]
async fn test_proxy_real_http_request() {
    println!("\n=== Testing Real HTTP Request through Proxy ===\n");
    println!("ℹ️  Note: Testing with httpbin.org (plain HTTP)");
    println!("ℹ️  For HTTPS endpoints, client must handle TLS layer\n");

    // Start the proxy server
    let proxy_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let proxy_addr = proxy_listener.local_addr().unwrap();
    println!("✓ Proxy server listening on {}", proxy_addr);

    // Spawn proxy server that connects to httpbin.org:80
    tokio::spawn(async move {
        while let Ok((stream, client_addr)) = proxy_listener.accept().await {
            println!("  Proxy: accepted WebSocket connection from {}", client_addr);

            tokio::spawn(async move {
                match tokio_tungstenite::accept_async(stream).await {
                    Ok(ws) => {
                        println!("  Proxy: WebSocket handshake completed");
                        // Use httpbin.org on port 80 (plain HTTP)
                        handle_proxy_test(ws, "httpbin.org:80".to_string()).await;
                    }
                    Err(e) => {
                        println!("  Proxy: WebSocket handshake failed: {}", e);
                    }
                }
            });
        }
    });

    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Connect WebSocket client to proxy
    let ws_url = format!("ws://{}", proxy_addr);
    println!("✓ Connecting to proxy at {}", ws_url);

    let (ws_stream, _) = connect_async(&ws_url).await.unwrap();
    let (mut ws_write, mut ws_read) = ws_stream.split();
    println!("✓ WebSocket connected");

    // Construct HTTP GET request to httpbin.org/json endpoint
    let http_request = format!(
        "GET /json HTTP/1.1\r\n\
         Host: httpbin.org\r\n\
         User-Agent: rust-proxy-test\r\n\
         Accept: application/json\r\n\
         Connection: close\r\n\
         \r\n"
    );

    println!("\n📤 Sending HTTP request:");
    println!("{}", http_request);

    // Send HTTP request as binary WebSocket message
    ws_write
        .send(Message::Binary(http_request.as_bytes().to_vec()))
        .await
        .unwrap();

    println!("✓ HTTP request sent through WebSocket\n");

    // Collect response data
    let mut response_data = Vec::new();
    let mut message_count = 0;

    println!("📥 Receiving HTTP response...\n");

    // Set timeout for receiving response
    let timeout_duration = tokio::time::Duration::from_secs(10);
    let start = tokio::time::Instant::now();

    // Read all binary messages until connection closes or timeout
    while let Some(result) = ws_read.next().await {
        if start.elapsed() > timeout_duration {
            println!("⚠️  Timeout waiting for response");
            break;
        }

        match result {
            Ok(Message::Binary(data)) => {
                message_count += 1;
                println!("  Received chunk #{}: {} bytes", message_count, data.len());
                response_data.extend_from_slice(&data);

                // Check if we've received the complete response
                let response_str = String::from_utf8_lossy(&response_data);
                if response_str.contains("Content-Length:") {
                    // Try to parse content length and check if we have all data
                    if let Some(content_length_line) = response_str.lines().find(|l| l.starts_with("Content-Length:")) {
                        if let Some(length_str) = content_length_line.split(':').nth(1) {
                            if let Ok(expected_length) = length_str.trim().parse::<usize>() {
                                // Check if we have headers + body
                                if let Some(body_start) = response_str.find("\r\n\r\n") {
                                    let body_received = response_data.len() - (body_start + 4);
                                    if body_received >= expected_length {
                                        println!("  ✓ Received complete response ({} bytes body)", body_received);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => {
                println!("  WebSocket closed by server");
                break;
            }
            Ok(msg) => {
                println!("  Received non-binary message: {:?}", msg);
            }
            Err(e) => {
                println!("  WebSocket error: {}", e);
                break;
            }
        }
    }

    println!("\n✓ Received total {} bytes in {} chunks\n", response_data.len(), message_count);

    // Parse HTTP response
    let response_str = String::from_utf8_lossy(&response_data);

    // Print COMPLETE transcript
    println!("==================== FULL HTTP TRANSCRIPT ====================");
    println!("{}", response_str);
    println!("==================== END TRANSCRIPT ({} bytes) ====================\n", response_data.len());

    // Verify response
    assert!(response_data.len() > 0, "Should receive response data");
    assert!(response_str.contains("HTTP/"), "Should contain HTTP status line");
    assert!(
        response_str.contains("200"),
        "Should receive HTTP 200 OK status"
    );

    // Check for expected JSON content from httpbin.org/json
    if response_str.contains("{") {
        println!("✓ Response contains JSON data");
        if response_str.contains("slideshow") {
            println!("✓ Response contains expected httpbin.org/json content");
        }
    }

    println!("\n✅ Real HTTP proxy test passed!");
    println!("\nℹ️  Note on HTTPS:");
    println!("  For HTTPS endpoints like https://swapi.dev/api/starships/9/:");
    println!("  1. The proxy forwards raw TCP (works for both HTTP and HTTPS)");
    println!("  2. The CLIENT must perform TLS handshake for HTTPS");
    println!("  3. For TLSNotary use case, MPC-TLS handles the encrypted connection\n");
}

/// Simple test to verify WebSocket client can send/receive binary messages
#[tokio::test]
async fn test_websocket_binary_frames() {
    // This is a basic test to ensure our WebSocket setup works
    println!("Testing WebSocket binary frame handling...");

    // Start a simple WebSocket echo server
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let ws_stream = tokio_tungstenite::accept_async(stream).await.unwrap();
        let (mut write, mut read) = ws_stream.split();

        // Echo back any binary messages
        while let Some(Ok(msg)) = read.next().await {
            if let Message::Binary(data) = msg {
                println!("WS Echo: received {} bytes, echoing", data.len());
                write.send(Message::Binary(data)).await.unwrap();
            }
        }
    });

    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Connect WebSocket client
    let ws_url = format!("ws://{}", addr);
    let (ws_stream, _) = connect_async(&ws_url).await.unwrap();
    let (mut write, mut read) = ws_stream.split();

    // Send binary data
    let test_data = b"Binary data test";
    write.send(Message::Binary(test_data.to_vec())).await.unwrap();
    println!("WS Client: sent {} bytes", test_data.len());

    // Receive echo
    if let Some(Ok(Message::Binary(response))) = read.next().await {
        println!("WS Client: received {} bytes", response.len());
        assert_eq!(test_data, &response[..]);
        println!("✅ WebSocket binary frame test passed!");
    } else {
        panic!("Expected binary message response");
    }
}
