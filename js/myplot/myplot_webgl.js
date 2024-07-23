"use strict";


class webgl_contour_plot {

    constructor(canvas_id) {

        this.canvas = document.querySelector("#" + canvas_id);
        this.gl = this.canvas.getContext("webgl");
        if (!this.gl) {
            alert("No WebGL");
        }
        /**
         * camera define zoom and pan of the camera. We don't need rotation for this application
         */
        this.camera = {
            x: 0,
            y: 0,
            zoom_x: 1,
            zoom_y: 1,
        };

       
        /**
         * wheel zoom global variables
         */
        this.viewProjectionMat;
        /**
         * Pan the camera by tracking mouse click and mouse move
         */
        this.startInvViewProjMat;
        this.startCamera;
        this.startPos;
        this.startClipPos;
        this.startMousePos;

        let vertex_shader_2d = `
            attribute vec2 a_position;
            uniform mat3 u_matrix;
            void main() {
            // Multiply the position by the matrix.
            gl_Position = vec4((u_matrix * vec3(a_position, 1)).xy, 0, 1);
            }
            `;

        let fragment_shader_2d = `
            precision mediump float;
            uniform vec4 u_color;
            void main() {
            gl_FragColor = u_color;
            }
            `;

        // setup GLSL program
        this.program = webglUtils.createProgramFromSources(this.gl, [vertex_shader_2d, fragment_shader_2d]);

        // look up where the vertex data needs to go.
        this.positionLocation = this.gl.getAttribLocation(this.program, "a_position");

        // lookup uniforms
        this.colorLocation = this.gl.getUniformLocation(this.program, "u_color");
        this.matrixLocation = this.gl.getUniformLocation(this.program, "u_matrix");

        // Create a buffer to put positions in
        this.positionBuffer = this.gl.createBuffer();
        // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);

        /**
         * Tell it to use our program (pair of shaders)
         * For our simple 2d program, we will only use one program. 
         * So we don't need to call gl.useProgram(program) every time we draw
         */
        this.gl.useProgram(this.program);

        // Turn on the attribute
        this.gl.enableVertexAttribArray(this.positionLocation);

        /**
         * Enable the scissor test.
         */
        this.gl.disable(this.gl.SCISSOR_TEST);

        // Bind the position buffer.
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);

        /**
         * Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
         * In our case, the data will not change, so we will use STATIC_DRAW in load_file() call
         * and we only need to call vertexAttribPointer once when initializing the program
         */
        var size = 2;          // 2 components per iteration
        var type = this.gl.FLOAT;   // the data is 32bit floats
        var normalize = false; // don't normalize the data
        var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        var offset = 0;        // start at the beginning of the buffer
        this.gl.vertexAttribPointer(this.positionLocation, size, type, normalize, stride, offset);

        this.polygon_length = [];
    };

    /**
     * Set buffer data and draw the scene
     * @param {Float32Array} points
     */
    set_data(points, points_stop,polygon_length,levels_length,colors,spectral_information,contour_lbs) {
        this.colors = colors;
        this.spectral_information = spectral_information;
        this.polygon_length = polygon_length;
        this.levels_length = levels_length;
        this.contour_lbs = contour_lbs;
        this.points_stop = points_stop;
        this.gl.bufferData(this.gl.ARRAY_BUFFER, points, this.gl.STATIC_DRAW);
    };


    /**
     * Draw the scene.
     */
    drawScene() {


        this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);

        // Clear the canvas.
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);



        /**
         * Draw the contour plot
         * One spectrum at a time
         * # of spectra = this.levels_length.length = this.colors.length = this.spectral_information.length = this.contour_lbs.length = this.polygon_length.length
         */
        for(var n=0;n<this.levels_length.length;n++)
        {
            /**
             * setCamera first, using saved this.x_ppm, this.x2_ppm, this.y_ppm, this.y2_ppm
             * and this.spec_information
             */
            let x = (this.x_ppm - this.spectral_information[n].x_ppm_start)/this.spectral_information[n].x_ppm_step;
            let x2 = (this.x2_ppm - this.spectral_information[n].x_ppm_start)/this.spectral_information[n].x_ppm_step;
            let y = (this.y_ppm - this.spectral_information[n].y_ppm_start)/this.spectral_information[n].y_ppm_step;
            let y2 = (this.y2_ppm - this.spectral_information[n].y_ppm_start)/this.spectral_information[n].y_ppm_step;
            this.setCamera(x, x2, y, y2);

            /**
             * Update the matrix according to the translation and scale defined in camera
             * this also depends on setCamera_ppm() and setCamera() functions
             */
            const projectionMat = m3.projection(this.gl.canvas.width, this.gl.canvas.height);
            const zoomScale_x = 1 / this.camera.zoom_x;
            const zoomScale_y = 1 / this.camera.zoom_y;

            let cameraMat = m3.identity();
            cameraMat = m3.translate(cameraMat, this.camera.x, this.camera.y);
            cameraMat = m3.scale(cameraMat, zoomScale_x, zoomScale_y);

            let viewMat = m3.inverse(cameraMat);
            this.viewProjectionMat = m3.multiply(projectionMat, viewMat);

            // Set the matrix. This matrix changes when zooming and panning
            this.gl.uniformMatrix3fv(this.matrixLocation, false, this.viewProjectionMat);


            /**
             * Draw the contour plot, one level at a time
             */
            for(var m=this.contour_lbs[n]; m < this.levels_length[n].length; m++)
            {
                let i_start = 0;
                if(m>0)
                {
                    i_start = this.levels_length[n][m-1];
                }
                let i_stop = this.levels_length[n][m];
                /**
                 * Draw the contour plot, one polygon at a time
                 */
                for (var i = i_start; i < i_stop; i++)
                {   
                    this.gl.uniform4fv(this.colorLocation, this.colors[n]);
                    var primitiveType = this.gl.LINE_STRIP;
                    let point_start = 0;
                    if(i>0)
                    {
                        point_start = this.polygon_length[n][i-1];
                    }
                    let count = this.polygon_length[n][i] - point_start;

                    let overlay_offset = 0;
                    if(n>0)
                    {
                        overlay_offset = this.points_stop[n-1]/2;
                    }
                    this.gl.drawArrays(primitiveType, point_start + overlay_offset, count);
                }
            }
        }
    };
 
    /**
     * Directly set this.camera position by calling this function.
     * This is useful when we want to zoom to a specific location, 
     * such as when webgl is overlaid as a background of a SVG plot and 
     * all the zooming and panning is handled by the SVG plot
     */
    setCamera(x, x2, y, y2) {
        /**
         * make sure x2 > x and y2 > y. Swap if not
         */
        if (x2 <= x) {
            let tmp = x2;
            x2 = x;
            x = tmp;
        }
        if (y2 <= y) {
            let tmp = y2;
            y2 = y;
            y = tmp;
        }

        this.camera = {
            x: x,
            y: y,
            zoom_x: this.canvas.clientWidth / (x2 - x),
            zoom_y: this.canvas.clientHeight / (y2 - y)
        };

    };


    /**
     * Set the camera according to ppm
     * Later in drawScene(), we will use this information to set the camera
     */
    setCamera_ppm(x_ppm,x2_ppm,y_ppm,y2_ppm) {
        this.x_ppm = x_ppm;
        this.x2_ppm = x2_ppm;
        this.y_ppm = y_ppm;
        this.y2_ppm = y2_ppm;
    }

    /**
     * Update ppm information
     */
    update_ppm(ref1, ref2) {
        this.x_ppm_start += ref1;
        this.y_ppm_start += ref2;
    }
};



