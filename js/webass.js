var wasm_base64;
var wasm_buffer;
var wasm;
var wasm_instance;
function hw() {
    wasm_base64 = "AGFzbQEAAAABBwFgAnx8AXwDAgEABwoBBm15X2FkZAAACgkBBwAgACABoAs=";
    wasm_buffer = Uint8Array.from(atob(wasm_base64), c => c.charCodeAt(0)).buffer;
    WebAssembly.compile(wasm_buffer).then(x => {
        wasm = x;
        wasm_instance = new WebAssembly.Instance(wasm);
        var x = wasm_instance.exports.my_add(2,2);
        console.log("2+2 = ",x);
    });
}