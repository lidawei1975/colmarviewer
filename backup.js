        readAsync = (url, onload, onerror) => {
            var input = document.getElementById("userfile");
            input.onchange = e => {
                var file = e.target.files[0];
                var reader = new FileReader();
                reader.onload = () => {
                    onload(reader.result);
                };
                reader.onerror = onerror;
                reader.readAsArrayBuffer(file);
            }
        }



        const api = {
            version: Module.cwrap("version", "number", []),
            deep: Module.cwrap("deep", "number", []),
            deep2: Module.cwrap("deep2", "number", []),
            };