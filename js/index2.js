
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

function get_data_new(triangle_2d)
{
    var data = new Float32Array(triangle_2d.length*3);

    for(let i=0;i<triangle_2d.length;i++)
    {
        data[i*3] = triangle_2d[i][1];
        data[i*3+1] = triangle_2d[i][0];
        data[i*3+2] = triangle_2d[i][2]-5;
    }

    return data;
}

function get_color_new(triangle_2d)
{
    var colors = new Uint8Array(triangle_2d.length*3);

    for(let i=0;i<triangle_2d.length;i++)
    {
        let color = 255-triangle_2d[i][2]*10;

        if(color < 0)
        {
            color = 0;
        }

        colors[i*3] = color;
        colors[i*3+1] = color;
        colors[i*3+2] = color;
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

    /**
     * Add event listener for range sliders translation_x, translation_y, translation_z
     */
    document.getElementById('translation_x').addEventListener('input', function () {
        main_plot.translation_x = this.value;
        main_plot.drawScene();
    });

    document.getElementById('translation_y').addEventListener('input', function () {
        main_plot.translation_y = this.value;
        main_plot.drawScene();
    });

    document.getElementById('translation_z').addEventListener('input', function () {
        main_plot.translation_z = this.value;
        main_plot.drawScene();
    });

    /**
     * Add event listener for range sliders scale_x, scale_y, scale_z
     */
    // document.getElementById('scale_x').addEventListener('input', function () {
    //     main_plot.scale_x = this.value;
    //     main_plot.drawScene();
    // });

    // document.getElementById('scale_y').addEventListener('input', function () {
    //     main_plot.scale_y = this.value;
    //     main_plot.drawScene();
    // });

    document.getElementById('scale_z').addEventListener('input', function () {
        main_plot.scale_z = this.value;
        main_plot.drawScene();
    });

    document.getElementById('fov').addEventListener('input', function () {
        main_plot.fov = this.value;
        main_plot.drawScene();
    });

    /**
     * Add event listener for file input
     */


    document.getElementById('ft2_file_form').addEventListener('submit', function (e) {
        e.preventDefault();
        var file = document.getElementById('userfile').files[0];
        var reader = new FileReader();
        reader.onload = function (e) {
            var spe = process_ft_file(e.target.result, "test.ft2", 0);

            /**
             * Rescale spe.raw_data to [0,250], using spe.spectral_max and spe.spectral_min
             */
            let new_spectrum_data = new Float32Array(spe.raw_data.length);
            for (let i = 0; i < spe.raw_data.length; i++) {
                new_spectrum_data[i] = 250 * (spe.raw_data[i] - spe.spectral_min) / (spe.spectral_max - spe.spectral_min);
            }

            /**
             * Define log_spectrum_data as log of new_spectrum_data + 1
             */
            let log_spectrum_data = new Float32Array(new_spectrum_data.length);
            for (let i = 0; i < new_spectrum_data.length; i++) {
                log_spectrum_data[i] = 40*Math.log(new_spectrum_data[i] + 80);
            }

            let xdim = spe.n_direct;
            let ydim = spe.n_indirect;


            let levels =[5];

            for( let i = 1; i < 40; i++)
            {
                levels.push(levels[i-1]*1.2);
                if(levels[i] > 250)
                {
                    levels = levels.slice(0,i);
                    break;
                }
            }

            /**
             * Calculate contour lines
             */
            let workerResult = get_contour_data(xdim,ydim,levels,new_spectrum_data);


            /**
             * Triangle_2d is an array of 3D coordinates of the triangles for webgl 3D plot
             */
            let triangle_2d = workerResult.triangle_2d;

            let data = get_data_new(triangle_2d);
            let colors = get_color_new(triangle_2d);

            let data_length = data.length;


            let line_data = workerResult.points;

            /**
             * Uniform blue color for all contour lines
             */
            let line_color = new Uint8Array(line_data.length);
            for(let i=0;i<line_color.length/3;i++)
            {
                line_color[i*3] = 0;
                line_color[i*3+1] = 0;
                line_color[i*3+2] = 255;
            }

           
            data = Float32Concat(data,line_data);
            colors = Uint8Concat(colors,line_color);

            /**
             * clear workerResult.points
             */
            workerResult.points = new Float32Array(0);

            main_plot = new webgl_contour_plot2('canvas1',data,colors,data_length,workerResult);
            main_plot.drawScene();
        };
        reader.readAsArrayBuffer(file);
    });
});

function get_contour_data(xdim,ydim,levels,data)
{
    const mathTool = new ldwmath(); 


    let polygons = d3.contours()
        // .smooth(false)
        .size([xdim, ydim])
        .thresholds(levels)(data);

    /**
     * Calculate the edges and center of each polygon
     */
    for (let i = 0; i < polygons.length; i++)
    {
        polygons[i].edge_centers = [];
        for (let j = 0; j < polygons[i].coordinates.length; j++)
        {
            let edge_centers = [];
            for (let k = 0; k < polygons[i].coordinates[j].length; k++)
            {
                let polygon = polygons[i].coordinates[j][k];
                let edge_center = mathTool.edgeAndCenter(polygon);
                edge_centers.push(edge_center);
            }
            polygons[i].edge_centers.push(edge_centers);
        }
    }


    /**
     * For each polygon at level i, let check all polygons at level i+1 to see whether it is inside the polygon at level i
     * If inside, add the index of polygon at level i+1 to polygons[i].children array
     */
    for (let i = 0; i < polygons.length - 1; i++)
    {   
        polygons[i].children = [];
        /**
         * Notice that polygons[i].edge_centers is an array of array of 6 numbers.
         * The double array is used by d3.contours to represent the polygon of same level but with multiple components (holes at same level)
         */
        for(let j = 0; j < polygons[i].edge_centers.length; j++)
        {
            let children = [];
            for(let k = 0; k < polygons[i].edge_centers[j].length; k++)
            {
                let child = [];
                /**
                 * Edge center of polygon at level i, polygon[j][k] is an array of 6 numbers
                 */
                let edge_center_i = polygons[i].edge_centers[j][k];

                let i2 = i + 1;
                for(let j2 = 0; j2 < polygons[i2].edge_centers.length; j2++)
                {
                    for(let k2 = 0; k2 < polygons[i2].edge_centers[j2].length; k2++)
                    {
                        /**
                         * Edge center of polygon at level i+1, polygon[j2][k2] is an array of 6 numbers
                         */
                        let edge_center_i2 = polygons[i2].edge_centers[j2][k2];

                        /**
                         * Check if edge_center_i2 is inside edge_center_i
                         * Step 1: if center of polygon at level i+1 is outside edge of polygon at level i, then it is not inside
                         * Step 2: run rayIntersectsLine for center of polygon at level i+1 and all edges of polygon at level i
                         */
                        let inside = false;

                        let center_x_i2 = edge_center_i2.center_x;
                        let center_y_i2 = edge_center_i2.center_y;

                        if(center_x_i2 > edge_center_i.left && center_x_i2 < edge_center_i.right && center_y_i2 > edge_center_i.bottom && center_y_i2 < edge_center_i.top)
                        {
                            /**
                             * Run rayIntersectsLine for center of polygon at level i+1 and all edges of polygon at level i
                             */
                            for(let l = 0; l < polygons[i].coordinates[j][k].length -1; l++)
                            {
                                let line_start = polygons[i].coordinates[j][k][l];
                                let line_end = polygons[i].coordinates[j][k][l+1];
                                let ray_origin = [center_x_i2,center_y_i2];
                                let ray_direction = [1,0];
                                let intersection = mathTool.rayIntersectsLine(ray_origin,ray_direction,line_start,line_end);
                                if(intersection !== null)
                                {
                                    console.log("intersection",ray_origin,line_start,line_end,intersection);
                                    inside = !inside;
                                }
                            }
                        }

                        if(inside)
                        {
                            child.push([j2,k2]);
                        }
                    }
                }
                children.push(child);
            }
            polygons[i].children.push(children); 
        }
    }
    
    /**
     * Array of 3D coordinates of the triangles for webgl 3D plot
     */
    let triangle_2d = []; 
    /**
     * For each polygon (except the last level). If it has children, define the children as a hole of the polygon
     */
    for(let i = 0; i < polygons.length - 1; i++)
    {
        for(let j = 0; j < polygons[i].coordinates.length; j++)
        {
            for(let k = 0; k < polygons[i].coordinates[j].length; k++)
            {
                if(polygons[i].children[j][k].length > 0)
                {
                    let hole_locations = [];
                    /**
                     * Deep copy the polygon to a new array
                     */
                    let polygon = [...polygons[i].coordinates[j][k]];
                    for(let l = 0; l < polygons[i].children[j][k].length; l++)
                    {
                        let child = polygons[i].children[j][k][l];
                        let child_polygon = polygons[i+1].coordinates[child[0]][child[1]];
                        /**
                         * Define a new polygon with the child_polygon as a hole. Track the hold by
                         * keeping the starting location of each hole
                         */
                        hole_locations.push(polygon.length);
                        polygon = polygon.concat(child_polygon);
                    }

                    /**
                     * Run earcut to triangulate the polygon with holes
                     * @var triangles is an array of indices of the vertices of the triangles, 3 indices represent a triangle
                     */
                    let triangles = earcut(polygon.flat(), hole_locations, 2);
                    
                    /**
                     * Convert the triangles to 3D coordinates for webgl 3D triangle plot
                    */
                    for(let l = 0; l < triangles.length; l+=3)
                    {
                        for(let m = 0; m < 3; m++)
                        {
                            let triangle_m = triangles[l+m];
                    
                            let x = polygon[triangle_m][0];
                            let y = polygon[triangle_m][1];
                            let z = levels[i];
                            /**
                             * If triangle_0 is in the hole, set z to i+1, otherwise set z to i
                             */
                            if(triangle_m >= hole_locations[0])
                            {
                                z = levels[i+1];
                            }
                            triangle_2d.push([x,y,z]);
                        }  
                    }

                }
            }
        }
    }

    let polygon_2d = [];

    let workerResult = {};


    workerResult.polygon_length = [];
    workerResult.levels_length = [];


    for (let m = 0; m < polygons.length; m++) {
        for (let i = 0; i < polygons[m].coordinates.length; i++) {
            for (let j = 0; j < polygons[m].coordinates[i].length; j++) {
                let coors2 = polygons[m].coordinates[i][j];
                let coors3 = [];
                /**
                 * coors2 is an array of length 2, representing a point in 2D
                 * We need to convert it to 3D by adding a z value
                 */
                for (let k = 0; k < coors2.length; k++) {
                    coors3.push([coors2[k][0], coors2[k][1], levels[m]]);
                }
                polygon_2d = polygon_2d.concat(coors3);
                workerResult.polygon_length.push(polygon_2d.length);
            }
        }
        workerResult.levels_length.push(workerResult.polygon_length.length);
    }
    

    let polygon_1d = new Array(polygon_2d.length * 3);

    for (let i = 0; i < polygon_2d.length; i++) {
        polygon_1d[i * 3] = polygon_2d[i][1]; //x value
        polygon_1d[i * 3 + 1] = polygon_2d[i][0]; //y value
        polygon_1d[i * 3 + 2] = polygon_2d[i][2]; //z value
    }
    workerResult.points = new Float32Array(polygon_1d);

    workerResult.triangle_2d = triangle_2d;

    return workerResult;
}


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


/**
 * Concat two float32 arrays into one
 * @returns the concatenated array
 */
function Float32Concat(first, second)
{
    var firstLength = first.length,
    result = new Float32Array(firstLength + second.length);

    result.set(first);
    result.set(second, firstLength);

    return result;
}

function Uint8Concat(first, second)
{
    var firstLength = first.length,
    result = new Uint8Array(firstLength + second.length);

    result.set(first);
    result.set(second, firstLength);

    return result;
}