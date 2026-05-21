use std::io;

use swissbank::serve;

#[tokio::main]
async fn main() -> io::Result<()> {
    tracing_subscriber::fmt::init();

    if let Err(e) = serve().await {
        eprintln!("Server error: {}", e);
        std::process::exit(1);
    }

    Ok(())
}
