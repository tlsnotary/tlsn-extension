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
