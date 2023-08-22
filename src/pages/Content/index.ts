console.log("Content script works!");
console.log("Must reload extension for modifications to take effect.");

window.onerror = (error) => {
	console.error(error);
};
