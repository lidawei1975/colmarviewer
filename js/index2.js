
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

var main_plot = null
const mathTool = new ldwmath(); 

$(document).ready(function () {

    /**
     * Resize observer for the big plot
     */
    plot_div_resize_observer.observe(document.getElementById("canvas_container")); 
 
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

            let minimal_level = spe.noise_level * 2.5 * 250 / spe.spectral_max;

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

            /**
             * Get user options from radio group name "plot_type"
             */
            let plot_type = document.querySelector('input[name="plot_type"]:checked').value;
            let plot_type_int = 0;

            /**
             * Convert to integer. 0: smooth surface, 1: terrace surface
             */
            if(plot_type == "terrace")
            {
                plot_type_int = 1;
            }
            else
            {
                plot_type_int = 0;
            }


            let workerResult = get_contour_data(spe.n_direct,spe.n_indirect,levels,new_spectrum_data,line_thickness,plot_type_int);

            /**
             * Create 3 cylinders for the x,y,z axis
             */
            let x_axis_triangle = [];
            let y_axis_triangle = [];
            let z_axis_triangle = [];
            
            /**
             * Create a polygon to simulate a circle with 36 vertices
             * These vertices are named as in yz plane, but are used 3 times to create a circle in yz, xz, xy planes
             */
            let x_axis_y = new Array(37);
            let x_axis_z = new Array(37);
            for(let angle_i = 0; angle_i <= 36; angle_i+=1)
            {
                x_axis_y[angle_i] = 0.5*Math.cos(angle_i/18*Math.PI);
                x_axis_z[angle_i] = 0.5*Math.sin(angle_i/18*Math.PI);
            }


            for(let i = 0; i < 36; i++)
            {   
                /**
                 * x axis cylinder
                 */
                let p1 = [0,x_axis_y[i],x_axis_z[i]];
                let p2 = [0,x_axis_y[i+1],x_axis_z[i+1]];
                let p3 = [spe.n_direct,x_axis_y[i],x_axis_z[i]];
                let p4 = [spe.n_direct,x_axis_y[i+1],x_axis_z[i+1]];
                x_axis_triangle.push(p1);
                x_axis_triangle.push(p2);
                x_axis_triangle.push(p3);
                x_axis_triangle.push(p2);
                x_axis_triangle.push(p3);
                x_axis_triangle.push(p4);

                /**
                 * y axis cylinder
                 */
                p1 = [x_axis_y[i],0,x_axis_z[i]];
                p2 = [x_axis_y[i+1],0,x_axis_z[i+1]];
                p3 = [x_axis_y[i],spe.n_indirect,x_axis_z[i]];
                p4 = [x_axis_y[i+1],spe.n_indirect,x_axis_z[i+1]];
                y_axis_triangle.push(p1);
                y_axis_triangle.push(p2);
                y_axis_triangle.push(p3);
                y_axis_triangle.push(p2);
                y_axis_triangle.push(p3);
                y_axis_triangle.push(p4);

                /**
                 * Z axis cylinder
                 */
                p1 = [x_axis_y[i],x_axis_z[i],0];
                p2 = [x_axis_y[i+1],x_axis_z[i+1],0];
                p3 = [x_axis_y[i],x_axis_z[i], 255];
                p4 = [x_axis_y[i+1],x_axis_z[i+1], 255];
                z_axis_triangle.push(p1);
                z_axis_triangle.push(p2);
                z_axis_triangle.push(p3);
                z_axis_triangle.push(p2);
                z_axis_triangle.push(p3);
                z_axis_triangle.push(p4);
            }

            /**
             * Create a cylinder (y axis)
             */


            /**
             * Convert workerResult.triangle_surface to Float32Array
             */
            let total_size = workerResult.triangle_surface.length*3+workerResult.triangle_contour.length*3;
            total_size += x_axis_triangle.length*3 + y_axis_triangle.length*3 + z_axis_triangle.length*3;
            let coordinates = new Float32Array(total_size);
            let colors = new Uint8Array(total_size);
            let normals = null;
            if(plot_type_int==1)
            {
                normals = new Float32Array(workerResult.triangle_surface.length*3);
            }
            

            for(let i=0;i<workerResult.triangle_surface.length;i++)
            {
                coordinates[i*3] = workerResult.triangle_surface[i][0];
                coordinates[i*3+1] = workerResult.triangle_surface[i][1];
                coordinates[i*3+2] = workerResult.triangle_surface[i][2];

                if(plot_type_int==1)
                {
                    normals[i*3] = workerResult.triangle_normals[i][0];
                    normals[i*3+1] = workerResult.triangle_normals[i][1];
                    normals[i*3+2] = workerResult.triangle_normals[i][2];
                }

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

            /**
             * number of vertices of the surface and contour lines
            */
            n += workerResult.triangle_contour.length*3;

            for(let i=0;i<x_axis_triangle.length;i++)
            {
                coordinates[n+i*3] = x_axis_triangle[i][0];
                coordinates[n+i*3+1] = x_axis_triangle[i][1];
                coordinates[n+i*3+2] = x_axis_triangle[i][2];

                /**
                 * Red color for the x axis
                 */
                colors[n+i*3] = 200;
                colors[n+i*3+1] = 0;
                colors[n+i*3+2] = 0;
            }

            n += x_axis_triangle.length*3;

            for(let i=0;i<y_axis_triangle.length;i++)
            {
                coordinates[n+i*3] = y_axis_triangle[i][0];
                coordinates[n+i*3+1] = y_axis_triangle[i][1];
                coordinates[n+i*3+2] = y_axis_triangle[i][2];

                /**
                 * Blue color for the y axis
                 */
                colors[n+i*3] = 0;
                colors[n+i*3+1] = 0;
                colors[n+i*3+2] = 200;
            }

            n += y_axis_triangle.length*3;

            for(let i=0;i<z_axis_triangle.length;i++)
            {
                coordinates[n+i*3] = z_axis_triangle[i][0];
                coordinates[n+i*3+1] = z_axis_triangle[i][1];
                coordinates[n+i*3+2] = z_axis_triangle[i][2];

                /**
                 * Green color for the z axis
                 */
                colors[n+i*3] = 0;
                colors[n+i*3+1] = 200;
                colors[n+i*3+2] = 0;
            }

            main_plot = new webgl_contour_plot2('canvas1',coordinates,normals,colors,spe.n_direct,spe.n_indirect,plot_type_int);
            main_plot.drawScene();
            /**
             * After first draw, need to resize to set correct viewport
             */
            resize_main_plot(document.getElementById('canvas_container').clientWidth,document.getElementById('canvas_container').clientHeight);
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

    document.getElementById('scale_y').addEventListener('input', function () {
        main_plot.scale_y = this.value;
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
    // window.addEventListener('keydown', function (e) {
    //     if (e.key === 'ArrowLeft') {
    //         main_plot.rotation_z -= 1;
    //         /**
    //          * Update the value of the range slider rotation_z as well
    //          */
    //         document.getElementById('rotation_z').value = main_plot.rotation_z;
    //     }
    //     if (e.key === 'ArrowRight') {
    //         main_plot.rotation_z += 1;
    //         document.getElementById('rotation_z').value = main_plot.rotation_z;
    //     }
    //     if (e.key === 'ArrowUp') {
    //         main_plot.rotation_x -= 1;
    //         document.getElementById('rotation_x').value = main_plot.rotation_x;
    //     }
    //     if (e.key === 'ArrowDown') {
    //         main_plot.rotation_x += 1;
    //         document.getElementById('rotation_x').value = main_plot.rotation_x;
    //     }
    //     main_plot.drawScene();
    // });

    /**
     * Add event listener for light_tilt and light_orientation
     */
    document.getElementById('light_tilt').addEventListener('input', function () {
        main_plot.light_tilt = this.value;
        main_plot.drawScene();
    });

    document.getElementById('light_orientation').addEventListener('input', function () {
        main_plot.light_orientation = this.value;
        main_plot.drawScene();
    });
}

/**
 * 
 * @param {int} n_direct: size of direct dimension of the input spectrum
 * @param {int} n_indirect: size of indirect dimension of the input spectrum
 * @param {array} levels: levels of the contour plot
 * @param {array} data: the spectrum data
 * @param {doube} thickness: thickness of the contour lines (when converting to 3D belts)
 * @param {int} flag: 0: smooth surface, 1: terrace surface 
 * @returns 
 */
function get_contour_data(n_direct,n_indirect,levels,data,thickness,flag)
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
    let triangle_normals = [];
    /**
     * For each polygon, triangulate them.
     * If it has children, define the children as a hole of the polygon
     */
    for(let i = 0; i < polygons.length; i++)
    {
        for(let j = 0; j < polygons[i].coordinates.length; j++)
        {
            for (let k = 0; k < polygons[i].coordinates[j].length; k++)
            {

                let hole_locations = [];
                /**
                 * Deep copy the polygon to a new array
                 */
                let polygon = [...polygons[i].coordinates[j][k]];
                for (let l = 0; l < polygons[i].children[j][k].length; l++) {
                    let child = polygons[i].children[j][k][l];
                    let child_polygon = polygons[i + 1].coordinates[child[0]][child[1]];
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
                for (let l = 0; l < triangles.length; l += 3)
                {
                    for (let m = 0; m < 3; m++)
                    {
                        let triangle_m = triangles[l + m];

                        let x = polygon[triangle_m][0];
                        let y = polygon[triangle_m][1];
                        let z = levels[i];
                        /**
                         * Only if flag ==0: If triangle_0 is in the hole, set z to i+1, otherwise set z to i
                         * For terrace surface, always set z to levels[i]
                         */
                        if (flag == 0 && triangle_m >= hole_locations[0]) {
                            z = levels[i + 1];
                        }
                        triangle_surface.push([x, y, z]);
                        if(flag==1)
                        {
                            triangle_normals.push([0,0,1]); //normal of the triangle is alway [0,0,1] for terrace surface    
                        }
                    }
                }

                /**
                 * For terrace surface, add the triangles for the vertical walls
                 * No vertical walls for the lowest level
                 */
                if (flag == 1 && i > 0)
                {
                    let polygon = [...polygons[i].coordinates[j][k]];
                    for (let l = 0; l < polygon.length - 1; l++)
                    {
                        /**
                         * For the rectangle, the coordinates are:
                         * 1. polygon[l][0], polygon[l][1], levels[i]
                         * 2. polygon[l][0], polygon[l][1], levels[i-1]
                         * 3. polygon[l+1][0], polygon[l+1][1], levels[i]
                         * 4. polygon[l+1][0], polygon[l+1][1], levels[i-1]
                         * 1,2,3 and 3,2,4 are two triangles
                         * All triangles are vertical, normal is (polygon[l+1] - polygon[l])'
                         */
                        let normal = [polygon[l + 1][1] - polygon[l][1], -polygon[l+1][0] + polygon[l][0], 0];
                        /**
                         * Need to normalize the normal
                         */
                        let normal_length = Math.sqrt(normal[0]*normal[0] + normal[1]*normal[1]);
                        normal[0] /= normal_length;
                        normal[1] /= normal_length;
                         
                        let x1 = polygon[l][0];
                        let y1 = polygon[l][1];
                        let z1 = levels[i];
                        let x2 = polygon[l][0];
                        let y2 = polygon[l][1];
                        let z2 = levels[i - 1];
                        let x3 = polygon[l + 1][0];
                        let y3 = polygon[l + 1][1];
                        let z3 = levels[i];
                        let x4 = polygon[l + 1][0];
                        let y4 = polygon[l + 1][1];
                        let z4 = levels[i - 1];
                        triangle_surface.push([x1, y1, z1]);
                        triangle_surface.push([x2, y2, z2]);
                        triangle_surface.push([x3, y3, z3]);
                        triangle_surface.push([x3, y3, z3]);
                        triangle_surface.push([x2, y2, z2]);
                        triangle_surface.push([x4, y4, z4]);
                        for(let m=0;m<6;m++)
                        {
                            triangle_normals.push(normal);
                        }
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
     * Only draw contour lines (as belt) when flag == 0
     */
    if(flag==0)
    {
        /**
         * m is the index of the level
         */
        for (let m = 0; m < polygons.length; m++)
        {
            for (let i = 0; i < polygons[m].coordinates.length; i++) 
            {
                for (let j = 0; j < polygons[m].coordinates[i].length; j++)
                {
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
    }

    let contour_result = new Object();

    contour_result.triangle_surface = triangle_surface;
    contour_result.triangle_contour = triangle_contour;
    contour_result.triangle_normals = triangle_normals;
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


var plot_div_resize_observer = new ResizeObserver(entries => {
    for (let entry of entries) {
        const cr = entry.contentRect;
        resize_main_plot(cr.width,cr.height);
    }
});


function resize_main_plot(canvas_width, canvas_height)
{

    console.log("new width is ", canvas_width, " new height is ", canvas_height);

    if(main_plot !== null)
    {
        document.getElementById('canvas1').style.width = canvas_width.toString() + "px";
        document.getElementById('canvas1').style.height = canvas_height.toString() + "px";
        document.getElementById('canvas1').setAttribute("height", canvas_height.toString());
        document.getElementById('canvas1').setAttribute("width", canvas_width.toString());
        main_plot.drawScene();
    }
    
}