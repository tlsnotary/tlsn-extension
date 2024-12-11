export function indexOfString(str: string, substr: string): number {
	return Buffer.from(str).indexOf(Buffer.from(substr));
}

export function bytesSize(str: string): number {
	return Buffer.from(str).byteLength;
}