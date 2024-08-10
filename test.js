     
     
     
function useFileInput() {
    
    /**
     * Get user selected file from file input element with an ID ft2file
     */
    var file = document.getElementById('ft2file').files[0];
    var fr = new FileReader();
    fr.onload = function () {
        var data = new Uint8Array(fr.result);
        Module['FS_createDataFile']('/', 'test.ft2', data, true, true, true);
    };
    fr.readAsArrayBuffer(file);
}     
     
     
     
function backup_code() {

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

    opts={
        encoding: 'utf8',
    }
    let r=FS.readFile('peaks.json',opts);
    let peaks=JSON.parse(r);



    const api = {
        version: Module.cwrap("version", "number", []),
        deep: Module.cwrap("deep", "number", []),
    };
}