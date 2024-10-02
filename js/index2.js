
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

function get_data_new(triangle_2d,z_shift)
{
    var data = new Float32Array(triangle_2d.length*3);

    for(let i=0;i<triangle_2d.length;i++)
    {
        data[i*3] = triangle_2d[i][1];
        data[i*3+1] = triangle_2d[i][0];
        data[i*3+2] = triangle_2d[i][2]+z_shift;
    }
    return data;
}

function get_color_new(triangle_2d)
{
    var colors = new Uint8Array(triangle_2d.length*3);

    for(let i=0;i<triangle_2d.length;i++)
    {
        let color = triangle_2d[i][2]*2.0;

        if(color < 7)
        {
            color = 7;
        }

        if(color > 124)
        {
            color = 125;
        }

        color = 255 - color;

        colors[i*3] = 248;
        colors[i*3+1] = color;
        colors[i*3+2] = color;
    }

    return colors;
}

var main_plot;
const mathTool = new ldwmath(); 

$(document).ready(function () {

    
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
                new_spectrum_data[i] = 255 * spe.raw_data[i]/spe.spectral_max;
            }

            let minimal_level = spe.noise_level * 5.5 * 250 / spe.spectral_max;

            let levels = [minimal_level];
            let n_levels = Math.log(spe.spectral_max/minimal_level)/Math.log(1.4);


            for( let i = 0; i < n_levels-1; i++)
            {
                levels.push(levels[i]*1.4);
            }

            /**
             * Calculate contour lines and surface triangles
             */
            let line_thickness = 400/spe.n_direct;
            let workerResult = get_contour_data(spe.n_direct,spe.n_indirect,levels,new_spectrum_data,line_thickness);


            /**
             * Convert workerResult.triangle_surface to Float32Array
             */
            let coordinates = new Float32Array(workerResult.triangle_surface.length*3+workerResult.triangle_contour.length*3);
            let colors = new Uint8Array(workerResult.triangle_surface.length*3+workerResult.triangle_contour.length*3);

            for(let i=0;i<workerResult.triangle_surface.length;i++)
            {
                coordinates[i*3] = workerResult.triangle_surface[i][0];
                coordinates[i*3+1] = workerResult.triangle_surface[i][1];
                coordinates[i*3+2] = workerResult.triangle_surface[i][2];

                /**
                 * color code the z value. 
                 */
                let color = workerResult.triangle_surface[i][2]*2.0;
                if(color < 7)
                {
                    color = 7;
                }  
                if(color > 124)
                {
                    color = 125;
                }
                colors[i*3] = 248;
                colors[i*3+1] = 255-color;
                colors[i*3+2] = 255-color;
            }

            /**
             * number of vertices of the surface
             */
            let n = workerResult.triangle_surface.length*3; 

            for(let i=0;i<workerResult.triangle_contour.length;i++)
            {   
                /**
                 * Shift z value by 1 to separate the surface and contour lines
                 * (make sure the contour lines are above the surface to ensure visibility)
                 */
                coordinates[n+i*3] = workerResult.triangle_contour[i][0];
                coordinates[n+i*3+1] = workerResult.triangle_contour[i][1];
                coordinates[n+i*3+2] = workerResult.triangle_contour[i][2]+1;

                /**
                 * Blue color for the contour lines
                 */
                colors[n+i*3] = 0;
                colors[n+i*3+1] = 0;
                colors[n+i*3+2] = 255;
            }

            main_plot = new webgl_contour_plot2('canvas1',coordinates,colors,spe.n_direct,spe.n_indirect);
            main_plot.drawScene();
            create_event_listener(main_plot);

        };
        reader.readAsArrayBuffer(file);
    });
});

function create_event_listener() {
    /**
 * Add event listener for range sliders rotation_x, rotation_y, rotation_z
 */
    document.getElementById('rotation_x').addEventListener('input', function () {
        main_plot.rotation_x = this.value;
        main_plot.drawScene();
    });

    document.getElementById('rotation_z').addEventListener('input', function () {
        main_plot.rotation_z = this.value;
        main_plot.drawScene();
    });


    document.getElementById('scale_z').addEventListener('input', function () {
        main_plot.scale_z = this.value;
        main_plot.drawScene();
    });


    /**
     * Drag event listener for canvas1
     */
    document.getElementById('canvas1').addEventListener('mousedown', function (e) {
        main_plot.dragging = true;
        main_plot.lastX = e.offsetX;
        main_plot.lastY = e.offsetY;
    });

    document.getElementById('canvas1').addEventListener('mousemove', function (e) {
        if (main_plot.dragging) {
            let dx = e.offsetX - main_plot.lastX;
            let dy = e.offsetY - main_plot.lastY;
            main_plot.lastX = e.offsetX;
            main_plot.lastY = e.offsetY;

            main_plot.drag(dx, dy);

            main_plot.drawScene();
        }
    });

    document.getElementById('canvas1').addEventListener('mouseup', function (e) {
        main_plot.dragging = false;
    });

    /**
     * Mouse wheel event listener for canvas1
     * main_plot.fov is the field of view of the camera, min: 0.05, max: 5
     */
    document.getElementById('canvas1').addEventListener('wheel', function (e) {
        let delta = e.deltaY;
        if (delta > 0) {
            main_plot.fov *= 1.1;
        } else {
            main_plot.fov *= 0.9;
        }
        if (main_plot.fov < 0.01) {
            main_plot.fov = 0.01;
        }
        if (main_plot.fov > 5) {
            main_plot.fov = 5;
        }
        main_plot.drawScene();
    });

    /**
     * Keyboard event listener for canvas1.
     * We track the keydown event for arrow keys and update:
     * rotation_z: left and right arrow keys
     * rotation_x: up and down arrow keys
     */
    window.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') {
            main_plot.rotation_z -= 1;
            /**
             * Update the value of the range slider rotation_z as well
             */
            document.getElementById('rotation_z').value = main_plot.rotation_z;
        }
        if (e.key === 'ArrowRight') {
            main_plot.rotation_z += 1;
            document.getElementById('rotation_z').value = main_plot.rotation_z;
        }
        if (e.key === 'ArrowUp') {
            main_plot.rotation_x -= 1;
            document.getElementById('rotation_x').value = main_plot.rotation_x;
        }
        if (e.key === 'ArrowDown') {
            main_plot.rotation_x += 1;
            document.getElementById('rotation_x').value = main_plot.rotation_x;
        }
        main_plot.drawScene();
    });
}

function get_contour_data(n_direct,n_indirect,levels,data,thickness)
{
    
    let polygons = d3.contours()
        .size([n_direct, n_indirect])
        .thresholds(levels)(data);

    /**
     * Calculate the edges and center of each polygon
     * @var polygons is an array of polygon, each have the following properties:
     * coordinates: an array of array of 2D coordinates of the polygon
     * edge_centers: an array of array of 6 numbers, each represent the edge center of the polygon
     * children: an array of array of array of 2 numbers, each represent the index of the children polygon
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
     * For the highest level, it has no children, but we still need to define polygons[i].children as an empty array
     */
    for (let i = 0; i < polygons.length; i++)
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

                if(i < polygons.length - 1)
                {
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
                                        // console.log("intersection",ray_origin,line_start,line_end,intersection);
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
                }
                children.push(child);
            }
            polygons[i].children.push(children); 
        }
    }
    
    /**
     * Array of 3D coordinates of the triangles for webgl 3D plot
     */
    let triangle_surface = []; 
    /**
     * For each polygon, triangulate them.
     * If it has children, define the children as a hole of the polygon
     */
    for(let i = 0; i < polygons.length; i++)
    {
        for(let j = 0; j < polygons[i].coordinates.length; j++)
        {
            for(let k = 0; k < polygons[i].coordinates[j].length; k++)
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
                            triangle_surface.push([x,y,z]);
                        }  
                    }
            }
        }
    }

    /**
     * @var triangle_contour is an array of 3D coordinates of the triangles
     * that are converted from the contour lines
     */
    let triangle_contour = [];
    /**
     * m is the index of the level
     */
    for (let m = 0; m < polygons.length; m++) {
        for (let i = 0; i < polygons[m].coordinates.length; i++) {
            for (let j = 0; j < polygons[m].coordinates[i].length; j++) {
                /**
                 * coors2 is an array of 2D coordinates of the polygon
                 */
                let coors2 = polygons[m].coordinates[i][j];
                /**
                 * Each line segment is defined by two points
                 * workerResult.points is an array of 3D coordinates of the points
                 */
                for(let k = 0; k < coors2.length - 1; k++)
                {
                    
                    let p1_x = coors2[k][0];
                    let p1_y = coors2[k][1];

                    let p2_x = coors2[k + 1][0];
                    let p2_y = coors2[k + 1][1];

                    let pz = levels[m];
                    
                    /**
                     * Calculate the normal of the line segment
                     */
                    let normal_x = p2_y - p1_y;
                    let normal_y = p1_x - p2_x;
                    let normal_length = Math.sqrt(normal_x*normal_x + normal_y*normal_y);
                    normal_x /= normal_length;
                    normal_y /= normal_length;
                    
                    /**
                     * Thickness of the line segment is 1.0, so we extend the line segment by 0.5 in both directions
                     */
                    normal_x *= thickness;
                    normal_y *= thickness; 
    
                    /**
                     * Line segment ==> 2 triangles. They are parallel to the xy plane
                    */
                    let p1 = [p1_x + normal_x, p1_y + normal_y, pz];
                    let p2 = [p1_x - normal_x, p1_y - normal_y, pz];
                    let p3 = [p2_x + normal_x, p2_y + normal_y, pz];
                    let p4 = [p2_x - normal_x, p2_y - normal_y, pz];
    
                    triangle_contour.push(p1);
                    triangle_contour.push(p2);
                    triangle_contour.push(p3);
                    triangle_contour.push(p2);
                    triangle_contour.push(p3);
                    triangle_contour.push(p4);

                    /**
                     * Add triangles that are perpendicular to the xy plane
                     */
                    let pp1 = [p1_x, p1_y, levels[m]+thickness];
                    let pp2 = [p1_x, p1_y, levels[m]-thickness];
                    let pp3 = [p2_x, p2_y, levels[m]+thickness];
                    let pp4 = [p2_x, p2_y, levels[m]-thickness];

                    triangle_contour.push(pp1);
                    triangle_contour.push(pp2);
                    triangle_contour.push(pp3);
                    triangle_contour.push(pp2);
                    triangle_contour.push(pp3);
                    triangle_contour.push(pp4);
                    
                }
            }
        }
    }

    let contour_result = new Object();

    contour_result.triangle_surface = triangle_surface;
    contour_result.triangle_contour = triangle_contour;
    return contour_result;
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

    
    result.noise_level = mathTool.estimate_noise_level(result.n_direct,result.n_indirect,result.raw_data);

    /**
     * Get max and min of z (z is sorted)
     */
    [result.spectral_max, result.spectral_min] = mathTool.find_max_min(result.raw_data);

    /**
     * In case of reconstructed spectrum from fitting or from NUS, noise_level is usually 0.
     * In that case, we define noise_level as spectral_max/power(1.5,40)
     */
    if(result.noise_level <= Number.MIN_VALUE)
    {
        result.noise_level = result.spectral_max/Math.pow(1.5,40);
    }

    return result;
}
