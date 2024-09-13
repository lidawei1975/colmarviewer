class spectrum {
    constructor() {
        this.header = new Float32Array(512); //header of the spectrum, 512 float32 numbers
        this.raw_data = new Float32Array(); //raw data from the server
        this.noise_level = 0.001; //noise level of the input spectrum
        this.levels = [0.001, 0.002, 0.003]; //levels of the contour plot
        this.spectral_max = Number.MAX_VALUE; //maximum value of the spectrum
        this.n_direct = 4096; //size of direct dimension of the input spectrum. integer
        this.n_indirect = 1204; //size of indirect dimension of the input spectrum. integer
        this.x_ppm_start = 12.0; //start ppm of direct dimension
        this.x_ppm_width = 12.0; //width of direct dimension
        this.x_ppm_step = -12.0 / 4096; //step of direct dimension
        this.y_ppm_start = 120.0; //start ppm of indirect dimension
        this.y_ppm_width = 120.0; //width of indirect dimension
        this.y_ppm_step = -120.0 / 1024; //step of indirect dimension
        this.x_ppm_ref = 0.0; //reference ppm of direct dimension
        this.y_ppm_ref = 0.0; //reference ppm of indirect dimension
        this.picked_peaks = []; //picked peaks
        this.fitted_peaks = []; //fitted peaks
        this.spectrum_origin = -1; //spectrum origin: -2: experimental spectrum from fid, -1: experimental spectrum uploaded,  n(n>=0): reconstructed from experimental spectrum n
        
        /**
         * Default median sigmax, sigmay, gammax, gammay
         */
        this.median_sigmax = 1.0;
        this.median_sigmay = 1.0;
        this.median_gammax = 1.0;
        this.median_gammay = 1.0;
    }
};



function get_data(heat_data,xdim,ydim)
{
    var data = new Float32Array(xdim*ydim*6*3);

    var step = 1;

    for(let i=0;i<xdim;i++){
        for(let j=0;j<ydim;j++){
            data[(i*ydim+j)*6*3] = i*step;
            data[(i*ydim+j)*6*3+1] = j*step;
            data[(i*ydim+j)*6*3+2] = heat_data[i*ydim+j];

            data[(i*ydim+j)*6*3+3] = (i+1)*step;
            data[(i*ydim+j)*6*3+4] = j*step;
            data[(i*ydim+j)*6*3+5] = heat_data[(i+1)*ydim+j];

            data[(i*ydim+j)*6*3+6] = i*step;
            data[(i*ydim+j)*6*3+7] = (j+1)*step;
            data[(i*ydim+j)*6*3+8] = heat_data[i*ydim+j+1];

            data[(i*ydim+j)*6*3+9] = (i+1)*step;
            data[(i*ydim+j)*6*3+10] = j*step;
            data[(i*ydim+j)*6*3+11] = heat_data[(i+1)*ydim+j];

            data[(i*ydim+j)*6*3+12] = (i+1)*step;
            data[(i*ydim+j)*6*3+13] = (j+1)*step;
            data[(i*ydim+j)*6*3+14] = heat_data[(i+1)*ydim+j+1];

            data[(i*ydim+j)*6*3+15] = i*step;
            data[(i*ydim+j)*6*3+16] = (j+1)*step;
            data[(i*ydim+j)*6*3+17] = heat_data[i*ydim+j+1];
        }
    }
    return data;
}

function get_color(heat_data,xdim,ydim)
{
    var colors = new Uint8Array(xdim*ydim*6*3);

    for(let i=0;i<xdim;i++){
        for(let j=0;j<ydim;j++){
            let color = Math.floor(heat_data[i*ydim+j]/100*255);
            colors[(i*ydim+j)*6*3] = color;
            colors[(i*ydim+j)*6*3+1] = 0;
            colors[(i*ydim+j)*6*3+2] = 255-color;

            colors[(i*ydim+j)*6*3+3] = color;
            colors[(i*ydim+j)*6*3+4] = 0;
            colors[(i*ydim+j)*6*3+5] = 255-color;

            colors[(i*ydim+j)*6*3+6] = color;
            colors[(i*ydim+j)*6*3+7] = 0;
            colors[(i*ydim+j)*6*3+8] = 255-color;

            colors[(i*ydim+j)*6*3+9] = color;
            colors[(i*ydim+j)*6*3+10] = 0;
            colors[(i*ydim+j)*6*3+11] = 255-color;

            colors[(i*ydim+j)*6*3+12] = color;
            colors[(i*ydim+j)*6*3+13] = 0;
            colors[(i*ydim+j)*6*3+14] = 255-color;

            colors[(i*ydim+j)*6*3+15] = color;
            colors[(i*ydim+j)*6*3+16] = 0;
            colors[(i*ydim+j)*6*3+17] = 255-color;
        }
    }
    return colors;
}




var main_plot;

$(document).ready(function () {



    /**
     * Add event listener for range sliders rotation_x, rotation_y, rotation_z
     */
    document.getElementById('rotation_x').addEventListener('input', function () {
        main_plot.rotation_x = this.value;
        main_plot.drawScene();
    });

    document.getElementById('rotation_y').addEventListener('input', function () {
        main_plot.rotation_y = this.value;
        main_plot.drawScene();
    });

    document.getElementById('rotation_z').addEventListener('input', function () {
        main_plot.rotation_z = this.value;
        main_plot.drawScene();
    });

    document.getElementById('ft2_file_form').addEventListener('submit', function (e) {
        e.preventDefault();
        var file = document.getElementById('userfile').files[0];
        var reader = new FileReader();
        reader.onload = function (e) {
            var spe = process_ft_file(e.target.result, "test.ft2", 0);

            /**
             * Rescale spe.raw_data to [0,200], using spe.spectral_max 
             */
            let new_spectrum_data = new Float32Array(spe.raw_data.length);
            for (let i = 0; i < spe.raw_data.length; i++) {
                new_spectrum_data[i] = 200 * spe.raw_data[i]/spe.spectral_max;
            }

            let xdim = spe.n_direct;
            let ydim = spe.n_indirect;
            let data = get_data(new_spectrum_data,xdim,ydim);
            let colors = get_color(new_spectrum_data,xdim,ydim);
            main_plot = new webgl_contour_plot2('canvas1',data,colors);
            main_plot.drawScene();

        };
        reader.readAsArrayBuffer(file);
    });
});

function process_ft_file(arrayBuffer,file_name, spectrum_type) {

    let result = new spectrum();

    result.spectrum_origin = spectrum_type;

    result.header = new Float32Array(arrayBuffer, 0, 512);

    result.n_indirect = result.header[219]; //size of indirect dimension of the input spectrum
    result.n_direct = result.header[99]; //size of direct dimension of the input spectrum

    result.tp = result.header[221];

    /**
     * if transposed, set result.error and return
     */
    if (result.tp !== 0) {
        result.error = "Transposed data, please un-transpose the data before loading";
        return result;
    }

    /**
     * Datatype of the direct and indirect dimension
     * 0: complex
     * 1: real
     */
    result.datatype_direct = result.header[55];
    result.datatype_indirect = result.header[56];

    /**
     * We only read real at this moment
     */
    if (result.datatype_direct !== 1 || result.datatype_indirect !== 1) {
        result.error = "Only real data is supported";
        return result;
    }

    result.direct_ndx = result.header[24]; //must be 2
    result.indirect_ndx = result.header[25]; //must be 1 or 3
    /**
     * direct_ndx must be 1, otherwise set error and return
     */
    if (result.direct_ndx !== 2) {
        result.error = "Direct dimension must be the second dimension";
        return result;
    }
    /**
     * indirect_ndx must be 1 or 3, otherwise set error and return
     */
    if (result.indirect_ndx !== 1 && result.indirect_ndx !== 3) {
        result.error = "Indirect dimension must be the first or third dimension";
        return result;
    }

    /**
     * result.sw, result.frq,result.ref are the spectral width, frequency and reference of the direct dimension
     * All are array of length 4
     */
    result.sw = [];
    result.frq = [];
    result.ref = [];

    result.sw[0] = result.header[229];
    result.sw[1] = result.header[100];
    result.sw[2] = result.header[11];
    result.sw[3] = result.header[29];

    result.frq[0] = result.header[218];
    result.frq[1] = result.header[119];
    result.frq[2] = result.header[10];
    result.frq[3] = result.header[28];

    result.ref[0] = result.header[249];
    result.ref[1] = result.header[101];
    result.ref[2] = result.header[12];
    result.ref[3] = result.header[30];

    /**
     * Get ppm_start, ppm_width, ppm_step for both direct and indirect dimensions
     */
    result.sw1 = result.sw[result.direct_ndx - 1];
    result.sw2 = result.sw[result.indirect_ndx - 1];
    result.frq1 = result.frq[result.direct_ndx - 1];
    result.frq2 = result.frq[result.indirect_ndx - 1];
    result.ref1 = result.ref[result.direct_ndx - 1];
    result.ref2 = result.ref[result.indirect_ndx - 1];


    result.x_ppm_start = (result.ref1 + result.sw1) / result.frq1;
    result.x_ppm_width = result.sw1 / result.frq1;
    result.y_ppm_start = (result.ref2 + result.sw2) / result.frq2;
    result.y_ppm_width = result.sw2 / result.frq2;
    result.x_ppm_step = -result.x_ppm_width / result.n_direct;
    result.y_ppm_step = -result.y_ppm_width / result.n_indirect;

    /**
     * shift by half of the bin size because the contour plot is defined by the center of each bin
     */
    result.x_ppm_start -= result.x_ppm_width / result.n_direct / 2;
    result.y_ppm_start -= result.y_ppm_width / result.n_indirect / 2;

    result.x_ppm_ref = 0.0;
    result.y_ppm_ref = 0.0;


    let data_size = arrayBuffer.byteLength / 4 - 512;

    result.raw_data = new Float32Array(arrayBuffer, 512 * 4, data_size);

    /**
     * Keep original file name
     */
    result.filename = file_name;

    /**
     * Get median of abs(z). If data_size is > 1024*1024, we will sample 1024*1024 points by stride
     */
    let stride = 1;
    if (data_size > 1024 * 1024) {
        stride = Math.floor(data_size / (1024 * 1024));
    }
    let z_abs = new Float32Array(data_size / stride);
    for (var i = 0; i < data_size; i += stride) {
        z_abs[Math.floor(i / stride)] = Math.abs(result.raw_data[i]);
    }
    z_abs.sort();
    result.noise_level = z_abs[Math.floor(z_abs.length / 2)];

    /**
     * Get max and min of z (z is sorted)
     */
    [result.spectral_max, result.spectral_min] = find_max_min(result.raw_data);

    /**
     * In case of reconstructed spectrum from fitting or from NUS, noise_level is usually 0.
     * In that case, we define noise_level as spectral_max/power(1.5,40)
     */
    if(result.noise_level <= Number.MIN_VALUE)
    {
        result.noise_level = result.spectral_max/Math.pow(1.5,40);
    }

    /**
     * Calculate positive contour levels 
     */
    result.levels = new Array(40);
    result.levels[0] = 5.5 * result.noise_level;
    for (let i = 1; i < result.levels.length; i++) {
        result.levels[i] = 1.5 * result.levels[i - 1];
        if (result.levels[i] > result.spectral_max) {
            result.levels = result.levels.slice(0, i+1);
            break;
        }
    }

    /**
     * Calculate negative contour levels
     */
    result.negative_levels = new Array(40);
    result.negative_levels[0] = -5.5 * result.noise_level;
    for (let i = 1; i < result.negative_levels.length; i++) {
        result.negative_levels[i] = 1.5 * result.negative_levels[i - 1];
        if (result.negative_levels[i] < result.spectral_min) {
            result.negative_levels = result.negative_levels.slice(0, i+1);
            break;
        }
    }

    return result;
}


/**
 * Find max and min of a Float32Array
 */
function find_max_min(data)
{
    let max = data[0];
    let min = data[0];
    for(let i=1;i<data.length;i++)
    {
        if(data[i] > max)
        {
            max = data[i];
        }
        if(data[i] < min)
        {
            min = data[i];
        }
    }
    return [max,min];
}