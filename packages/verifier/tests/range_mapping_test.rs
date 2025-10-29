// Test for verifier range mapping logic
// This tests that byte ranges calculated on plaintext transcript
// correctly map to the revealed transcript

#[cfg(test)]
mod tests {
    use std::str;

    #[test]
    fn test_range_mapping_with_redacted_bytes() {
        // Simulate a plaintext HTTP response
        let plaintext = b"HTTP/1.1 200 OK\r\nDate: Wed, 29 Oct 2025 14:38:42 GMT\r\nContent-Type: application/json\r\n\r\n{\"screen_name\":\"test_user\"}";

        println!("Plaintext length: {}", plaintext.len());
        println!("Plaintext: {}", String::from_utf8_lossy(plaintext));

        // The Date header is at bytes 17-50 (Date: Wed, 29 Oct 2025 14:38:42 GMT)
        let date_header_start = 17;
        let date_header_end = 51;
        let date_header_bytes = &plaintext[date_header_start..date_header_end];
        println!("\nDate header bytes [{}..{}]: {}",
                 date_header_start, date_header_end,
                 String::from_utf8_lossy(date_header_bytes));

        // Simulate what the verifier receives after reveal
        // In TLSNotary, unrevealed bytes are replaced with a marker
        // Let's simulate by replacing the Content-Type header with 🙈 markers
        let mut revealed = plaintext.to_vec();

        // Replace "Content-Type: application/json\r\n" with redaction markers
        let content_type_start = 52;
        let content_type_end = 85;
        for i in content_type_start..content_type_end {
            revealed[i] = 0xFF; // Use 0xFF as a redaction marker for testing
        }

        println!("\nRevealed length: {}", revealed.len());
        println!("Revealed (with 0xFF markers): {:?}", &revealed[..100]);

        // Now try to map the Date header range on the revealed transcript
        let mapped_date = &revealed[date_header_start..date_header_end];
        println!("\nMapped Date header: {}", String::from_utf8_lossy(mapped_date));

        // The Date header should still be readable since it was revealed
        assert_eq!(
            String::from_utf8_lossy(date_header_bytes),
            String::from_utf8_lossy(mapped_date),
            "Date header should match between plaintext and revealed"
        );
    }

    #[test]
    fn test_string_vs_byte_indices() {
        // Test that string indices don't match byte indices with multi-byte UTF-8
        let text_with_emoji = "Hello 🙈 World";
        let bytes = text_with_emoji.as_bytes();

        println!("Text: {}", text_with_emoji);
        println!("String length (chars): {}", text_with_emoji.chars().count());
        println!("Byte length: {}", bytes.len());

        // The emoji 🙈 is 4 bytes in UTF-8
        // So "Hello " is 6 bytes, then 🙈 is 4 bytes, then " World" is 6 bytes
        assert_eq!(bytes.len(), 16); // 6 + 4 + 6 = 16 bytes

        // If we calculated a range as string index [7..12] thinking it's "World"
        // but applied it as byte index, we'd get garbage
        let string_range = &text_with_emoji[7..12]; // This works on char boundaries
        let byte_range = &bytes[7..12]; // This slices in the middle of the emoji!

        println!("String range [7..12]: {}", string_range);
        println!("Byte range [7..12]: {:?}", byte_range);

        // The byte range will contain partial UTF-8 sequences
        assert_ne!(string_range.as_bytes(), byte_range, "String and byte ranges differ");
    }

    #[test]
    fn test_verifier_mapping_logic() {
        // Simulate the exact scenario from the bug report
        let plaintext_response = b"HTTP/1.1 200 OK\r\nDate: Wed, 29 Oct 2025 14:38:42 GMT\r\nContent-Length: 30\r\n\r\n{\"screen_name\":\"test_user\"}";

        // Calculate range for Date header value (after "Date: ")
        let date_value_start = 23; // Position of "Wed" in "Date: Wed, 29..."
        let date_value_end = 51;   // End of GMT

        println!("Plaintext: {}", String::from_utf8_lossy(plaintext_response));
        println!("Date value range [{}..{}]: {}",
                 date_value_start, date_value_end,
                 String::from_utf8_lossy(&plaintext_response[date_value_start..date_value_end]));

        // Simulate revealed transcript (verifier receives this)
        // In reality, TLSNotary replaces unrevealed bytes, but the REVEALED bytes
        // should be at the SAME byte offsets
        let revealed = plaintext_response.to_vec();

        // Map the range on revealed transcript
        let mapped_value = &revealed[date_value_start..date_value_end];
        println!("Mapped value: {}", String::from_utf8_lossy(mapped_value));

        // This should work IF the ranges are byte offsets on the original transcript
        assert_eq!(
            &plaintext_response[date_value_start..date_value_end],
            mapped_value,
            "Range should map correctly to revealed transcript"
        );
    }
}
