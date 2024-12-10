


/**
 * Additional event listener for spin_system_table table tbody first row 2nd td input and 3rd td input
 */

window.addEventListener('load', function() {
    /**
     * Event listener for spin_system_table table tbody first row 2nd td input and 3rd td input
     */
    let input1=document.getElementById("spin_system_table").tBodies[0].rows[0].cells[1].querySelector("input");
    let input2=document.getElementById("spin_system_table").tBodies[0].rows[0].cells[2].querySelector("input");
    let input3=document.getElementById("spin_system_table").tBodies[0].rows[0].cells[3].querySelector("input");
    let input4=document.getElementById("spin_system_table").tBodies[0].rows[0].cells[4].querySelector("input");
    input1.addEventListener('change', function () {
        process_ppm_j_change(this.parentElement.parentElement.rowIndex,input1.value,input2.value,input3.value,input4.value);
    });
    input2.addEventListener('change', function () {
        process_ppm_j_change(this.parentElement.parentElement.rowIndex,input1.value,input2.value,input3.value,input4.value);
    });
    input3.addEventListener('change', function () {
        process_ppm_j_change(this.parentElement.parentElement.rowIndex,input1.value,input2.value,input3.value,input4.value);
    });
    input4.addEventListener('change', function () {
        process_ppm_j_change(this.parentElement.parentElement.rowIndex,input1.value,input2.value,input3.value,input4.value);
    });
});



/**
 * Click to add a row at the end to the tbody of table with id "spin_system_table"
 */
function add_one_peak()
{
    let table = document.getElementById("spin_system_table");
    let table_body = table.getElementsByTagName('tbody')[0];
    let row = table_body.insertRow(-1);

    /**
     * The row has 5 cells. 1st is index, 2nd is ppm_c, 3nd is ppm, 4rd is peak width, 5rd is j coupling
     */
    let cell0 = row.insertCell(0);
    let cell1 = row.insertCell(1);
    let cell2 = row.insertCell(2);
    let cell3 = row.insertCell(3);
    let cell4 = row.insertCell(4);


    cell0.innerHTML = row.rowIndex;

    /**
     * Create am input element for ppm_c, and set its type to number and step to any
     */
    let input_ppm_c = document.createElement('input');
    input_ppm_c.type = "number";
    input_ppm_c.step = "any";
    input_ppm_c.addEventListener('change', function () {
        process_ppm_j_change(this.parentElement.parentElement.rowIndex, input_ppm_c.value,input_ppm.value, input_width.value, input_j.value);
    });
    cell1.appendChild(input_ppm_c);
    
    /**
     * Create a input element for ppm, and set its type to number and step to any
     */
    let input_ppm = document.createElement('input');
    input_ppm.type = "number";
    input_ppm.step = "any";
    /**
     * Attach an event listener to input_ppm, so that when the value is changed, the corresponding peak on the plot will be updated
     */
    input_ppm.addEventListener('change', function () {
        process_ppm_j_change(this.parentElement.parentElement.rowIndex, input_ppm_c.value,input_ppm.value, input_width.value, input_j.value);
    });
    cell2.appendChild(input_ppm);

    /**
     * Create input element for peak width, and set its type to number and step to any
     */
    let input_width = document.createElement('input');
    input_width.type = "number";
    input_width.step = "any";
    cell3.appendChild(input_width);
    /**
     * Attach an event listener to input_width, so that when the value is changed, the corresponding peak on the plot will be updated
     */
    input_width.addEventListener('change', function () {
        process_ppm_j_change(this.parentElement.parentElement.rowIndex, input_ppm_c.value,input_ppm.value, input_width.value, input_j.value);
    });

    /**
     * Create a input element for j coupling, and set its type to text and value to ""
     */
    let input_j = document.createElement('input');
    input_j.type = "text";
    input_j.value = "";
    /**
     * Attach an event listener to input_j, so that when the value is changed, the corresponding peak on the plot will be updated
     */
    input_j.addEventListener('change', function () {
        process_ppm_j_change(this.parentElement.parentElement.rowIndex, input_ppm_c.value,input_ppm.value, input_width.value, input_j.value);
    });
    cell4.appendChild(input_j);
}

function process_ppm_j_change(row_index,ppm,ppm_c,width,j)
{
    ppm_c=parseFloat(ppm_c);
    ppm = parseFloat(ppm);
    width = parseFloat(width);
    console.log("Row index is " + row_index + ", ppm is " + ppm + "width is " + width + ", j is " + j);
    /**
     * Simulate peaks from ppm and j coupling
     * Step 1. Separate j coupling into an array of numbers (any number of spaces or commas)
     */
    let j_couplings = j.split(/[\s,]+/).map(Number);

    /**
     * For non-number or spaces, the map function will return NaN or 0, we need to remove them
     */
    j_couplings = j_couplings.filter(function (value) {
        return !isNaN(value) && value !== 0;
    });

    /**
     * If ppm is not a number, reset it to 0.0
     */
    if(isNaN(ppm))
    {
        ppm = 0.0;
    }

    /**
     * If ppm_c is not a number, reset it to 0.0
     */
    if(isNaN(ppm_c))
    {
        ppm_c = 0.0;
    }

    /**
     * If width is not a number, reset it to 1.0
     */
    if(isNaN(width))
    {
        width = 1.0;
    }

    /**
     * Flag to indicate whether spin system is valid
     */
    let flag_spin_system = true;
    
    /**
     * @var hz_2_ppm: 1 Hz is how many ppm (direct dimension)
     */
    let hz_2_ppm = 1/hsqc_spectra[0].frq1;
    /**
     * @var ppm_per_step: how many ppm per data point (direct dimension)
     */
    let ppm_per_step = hsqc_spectra[0].x_ppm_width / hsqc_spectra[0].n_direct;

    /**
     * Step 2, apply the j couplings to the ppm, one by one
     */
    let current_peaks = [ppm];
    let new_peaks = [];
    for(let i=0;i<j_couplings.length;i++)
    {
        /**
         * A J coupling of > 100 Hz is a flag or failed spin optimization
         */
        if(j_couplings[i] > 100)
        {
            flag_spin_system = false;
            break;
        }

        /**
         * For any peak in current_peaks, apply j_couplings[i] to it
         * to make two new peaks, at ppm + j_couplings[i]/2 and ppm - j_couplings[i]/2
         */
        for(let j=0;j<current_peaks.length;j++)
        {
            new_peaks.push(current_peaks[j] + j_couplings[i] * hz_2_ppm / 2);
            new_peaks.push(current_peaks[j] - j_couplings[i] * hz_2_ppm / 2);
        }
        current_peaks = new_peaks;
        new_peaks = [];
    }

    /**
     * Sum of all j_couplings is the total span of the multiplet
     */
    let total_span = j_couplings.reduce((a,b) => a + b, 0);
    total_span *= hz_2_ppm; // convert to ppm
    total_span += ppm_per_step*10; // add 10 points to the total span

    /**
     * In case flag_spin_system == false, we need to reset total_span
     * because we can't get sum of all j couplings
     */
    if(flag_spin_system === false){
        total_span = ppm_per_step*10; 
    }

    /**
     * Make a 1D profile from all these peaks, which have same peak width and peak height.
     * Let generate the profile from -total_span/2 to total_span/2 around ppm, at step of ppm_per_step
    */
    let n_data = Math.floor(total_span / ppm_per_step) + 1;
    let x = new Float32Array(n_data);
    let y = new Float32Array(n_data);
    let x_start = ppm - total_span / 2;
    for(let i=0;i<n_data;i++)
    {
        x[i] = x_start + i * ppm_per_step;
        y[i] = 0.0;
    }

    /**
     * Generate the peak profile
     * Note: width is actually sigma, not FWHH
     */
    width *= ppm_per_step; // convert to ppm from points
    for(let i=0;i<current_peaks.length;i++)
    {
        for(let j=0;j<n_data;j++)
        {
            y[j] += Math.exp(-Math.pow(x[j] - current_peaks[i],2) / (2 * Math.pow(width,2)));
        }
    }

    /**
     * Convert x and y to array of [x,y] 
     * Remember y is the intensity of the peak, not the ppm_c value.
     * To plot it correct, we need to convert to ppm_c value
     * [0,1] will be projected to [ppm_c,ppm_c - profile]
     */
    let data = [];
    for(let i=0;i<n_data;i++)
    {
        data.push([x[i],ppm_c - y[i]]);
    }


    /**
     * Update the profile on the plot
     */
    main_plot.add_predicted_peaks(data,flag_spin_system,row_index-1);
}

/**
 * Convert spin_system_table into a text file
 * Each line is a peak, with 4 columns: ppm_c, ppm, width, j_coupling
 * Save the file as spin_system.txt 
 */
function save_spin_system()
{
    let table = document.getElementById("spin_system_table");
    let table_body = table.getElementsByTagName('tbody')[0];
    let n_rows = table_body.rows.length;
    let file_buffer = "";
    for(let i=0;i<n_rows;i++)
    {
        let row = table_body.rows[i];
        let ppm_c = row.cells[1].children[0].value;
        let ppm = row.cells[2].children[0].value;
        let width = row.cells[3].children[0].value;
        let j_coupling = row.cells[4].children[0].value;
        file_buffer += ppm_c + " " + ppm + " " + width + " " + j_coupling + "\n";
    }

    let blob = new Blob([file_buffer], { type: 'text/plain' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = "spin_system.txt";
    a.click();

    /**
     * Remove the url and a
     */
    URL.revokeObjectURL(url);
    a.remove();
}

/**
 * Load spin_system.txt into spin_system_table
 * @param {File} obj: the file object
 */
function load_spin_system(obj)
{
    /**
     * If no file is selected, return
     */
    if(obj.files.length === 0)
    {
        return;
    }

    let file = obj.files[0];
    let reader = new FileReader();
    reader.onload = function(e)
    {
        let content = e.target.result;
        let lines = content.split("\n");
        for(let i=0;i<lines.length;i++)
        {
            let line = lines[i].trim();
            if(line === "")
            {
                continue;
            }
            let fields = line.split(" ");
            if(fields.length < 3)
            {
                continue;
            }
            /**
             * Get current number of rows in the table
             */
            let n_rows = document.getElementById("spin_system_table").getElementsByTagName('tbody')[0].rows.length;
            /**
             * If we need to add more rows, add one row
             */
            if(i >= n_rows)
            {
                add_one_peak();
            }
            let table = document.getElementById("spin_system_table");
            let table_body = table.getElementsByTagName('tbody')[0];
            let row = table_body.rows[table_body.rows.length - 1];
            row.cells[1].children[0].value = fields[0];
            row.cells[2].children[0].value = fields[1];
            row.cells[3].children[0].value = fields[2];
            /**
             * Combine all remaining fields into one string, separated by space
             */
            row.cells[4].children[0].value = fields.slice(3).join(" ");
            /**
             * Force a change event to update the plot
             */
            row.cells[1].children[0].dispatchEvent(new Event('change'));
        }
    }
    reader.readAsText(file);
}


function run_spin_system()
{
    /**
     * Send the spectrum and fitted peaks to the webassembly_worker
     * We suppose there in only one spectrum in array hsqc_spectra
     * Combine spectrum.header and spectrum.data into one unit8array
     * to be sent to the webassembly_worker as a file
     */
    let data = Float32Concat(hsqc_spectra[0].header, hsqc_spectra[0].raw_data);
    let data_uint8 = new Uint8Array(data.buffer);

    let fitted_peaks = hsqc_spectra[0].fitted_peaks_tab;

    webassembly_worker.postMessage({
        webassembly_job: "spin_optimization",
        spectrum_file: data_uint8,
        fitted_peaks_file: fitted_peaks,
        b0: hsqc_spectra[0].frq1,
    });
}

function process_spin_optimization_result(data)
{
    console.log(data);
    /**
     * Example line
     * 0.0309074 0.920157 49.8763 1.75854 12.779 6.35695 14.2737
     * Failed optimization line:
     * 1.0 0.807704 18.8488 1.0 1000.0
     */
    let lines = data.split("\n");
    let table = document.getElementById("spin_system_table");
    let table_body = table.getElementsByTagName('tbody')[0];
    let n_rows = table_body.rows.length;
    for(let i=0;i<lines.length;i++)
    {
        let line = lines[i].trim();
        let fields = line.split(" ");
        /**
         * Skip if there are less than 4 fields. This is an invalid line
         */
        if(fields.length < 4)
        {
            continue;
        }

        let error = parseFloat(fields[0]);
        /**
         * Skip if error > 0.6
         */
        if(error > 0.6)
        {
            continue;
        }
        /**
         * Remove the first field
         */
        fields.shift();


        if(i >= n_rows)
        {
            add_one_peak();
        }
        let row = table_body.rows[i];
        row.cells[1].children[0].value = fields[0];
        row.cells[2].children[0].value = fields[1];
        row.cells[3].children[0].value = fields[2];
        row.cells[4].children[0].value = fields.slice(3).join(" ");
        row.cells[1].children[0].dispatchEvent(new Event('change'));
    }
}