"use strict";


class webgl_contour_plot {

    constructor(canvas_id) {

        this.canvas = document.querySelector("#" + canvas_id);
        this.gl = this.canvas.getContext("webgl");
        if (!this.gl) {
            alert("No WebGL");
        }

        this.level_lb =0; // lower bound of the contour level

        /**
         * camera define zoom and pan of the camera. We don't need rotation for this application
         */
        let camera = {
            x: 0,
            y: 0,
            zoom_x: 1,
            zoom_y: 1,
        };

        /**
         * view define the view port of the canvas. 
         * Relative to the canvas size. So full canvas is [0,1,0,1]
        */
        let view = {
            left: 0,
            right:1,
            bottom: 0,
            top: 1,
        };

        /**
         * When show multiple zoomed regions, we need to keep track of the zoomed region (camera) 
         * and correspond view port (view) for each region.
         */
        this.camera_stack = [camera];
        this.view_stack = [view];


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
        this.gl.enable(this.gl.SCISSOR_TEST);

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
    set_data(points, polygon_length,levels_length,overlays,colors) {
        this.colors = colors;
        this.overlays = overlays;
        this.polygon_length = polygon_length;
        this.levels_length = levels_length;
        this.gl.bufferData(this.gl.ARRAY_BUFFER, points, this.gl.STATIC_DRAW);
    };

    /**
     * set_spectrum_information information from the spectrum file
     */
    set_spectrum_information(x_ppm_start, x_ppm_step, y_ppm_start, y_ppm_step,n_direct, n_indirect) {
        this.x_ppm_start = x_ppm_start;
        this.x_ppm_step = x_ppm_step;
        this.y_ppm_start = y_ppm_start;
        this.y_ppm_step = y_ppm_step;
        this.n_direct = n_direct;
        this.n_indirect = n_indirect;
    }

    /**
     * Draw the scene.
     */
    drawScene() {
        webglUtils.resizeCanvasToDisplaySize(this.gl.canvas);

        /**
         * Loop through all the camera and view port pairs
         * This is useful when we want to show multiple zoomed regions
         */
        for (var i = 0; i < this.camera_stack.length; i++) {
            this.camera = this.camera_stack[i];
            this.view = this.view_stack[i];
            this.updateViewProjection();
            this.drawScene_helper();
        }
    }

    /**
     * Draw the scene helper function
     * This function is called by drawScene() only
    */ 
    drawScene_helper() {
        // Tell WebGL how to convert from clip space to pixels
        this.gl.viewport(
            this.view.left * this.gl.canvas.width,
            this.view.bottom * this.gl.canvas.height, 
            (this.view.right - this.view.left) * this.gl.canvas.width,
            (this.view.top - this.view.bottom) * this.gl.canvas.height
            );

        /**
         * Apply scissor test to clear only the viewport
         */
        this.gl.scissor(
            this.view.left * this.gl.canvas.width,
            this.view.bottom * this.gl.canvas.height,
            (this.view.right - this.view.left) * this.gl.canvas.width,
            (this.view.top - this.view.bottom) * this.gl.canvas.height
        );

        // Clear the canvas.
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        /**
         * Update the matrix acoording to the translation and scale defined in camera
         */
        this.updateViewProjection();

        // Set the matrix. This matrix changes when zooming and panning
        this.gl.uniformMatrix3fv(this.matrixLocation, false, this.viewProjectionMat);

        // Draw the geometry.
        for(var n=0;n<this.overlays.length;n++)
        {
            let m_start =0;
            if(n>0)
            {
                m_start = this.overlays[n-1];
            }
            let m_end = this.overlays[n];

            for(var m=m_start+this.level_lb;m< m_end-1;m++) //notice -1 because we will use this.levels_length[m+1] below
            {
                let i_start = 0;
                if(m>0)
                {
                    i_start = this.levels_length[m-1];
                }
                for (var i = i_start; i < this.levels_length[m]; i++)
                {   
                    this.gl.uniform4fv(this.colorLocation, this.colors[n]);
                    var primitiveType = this.gl.LINE_STRIP;
                    let offset = 0;
                    if(i>0)
                    {
                        offset = this.polygon_length[i-1];
                    }
                    var count = this.polygon_length[i] - offset; 
                    this.gl.drawArrays(primitiveType, offset, count);
                }
            }
        }
    };


    makeCameraMatrix() {
        const zoomScale_x = 1 / this.camera.zoom_x;
        const zoomScale_y = 1 / this.camera.zoom_y;
        let cameraMat = m3.identity();
        cameraMat = m3.translate(cameraMat, this.camera.x, this.camera.y);
        cameraMat = m3.scale(cameraMat, zoomScale_x, zoomScale_y);
        return cameraMat;
    };

    updateViewProjection() {
        const projectionMat = m3.projection(this.gl.canvas.width, this.gl.canvas.height);
        const cameraMat = this.makeCameraMatrix();
        let viewMat = m3.inverse(cameraMat);
        this.viewProjectionMat = m3.multiply(projectionMat, viewMat);
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

        let camera = {
            x: x,
            y: y,
            zoom_x: this.canvas.clientWidth / (x2 - x),
            zoom_y: this.canvas.clientHeight / (y2 - y)
        };

        this.camera_stack.push(camera);
    };

    setView(x, x2, y, y2) {
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

        let view = {
            left: x,
            right: x2,
            bottom: y,
            top: y2
        };


        this.view_stack.push(view);
    }

    clearCamera() {
        this.camera_stack = [];
    }
    
    clearView() {
        this.view_stack = [];
    }


    /**
     * Set the camera according to ppm
     */
    setCamera_ppm(x_ppm,x2_ppm,y_ppm,y2_ppm) {
        let x = (x_ppm - this.x_ppm_start)/this.x_ppm_step;
        let x2 = (x2_ppm - this.x_ppm_start)/this.x_ppm_step;
        let y = (y_ppm - this.y_ppm_start)/this.y_ppm_step;
        let y2 = (y2_ppm - this.y_ppm_start)/this.y_ppm_step;
        this.setCamera(x, x2, y, y2);
    }

    /**
     * Set the contour level lower bound
     */
    set_level_lb(level_lb) {
        this.level_lb = level_lb;
        this.drawScene();
    }

    /**
     * Update ppm information
     */
    update_ppm(ref1, ref2) {
        this.x_ppm_start += ref1;
        this.y_ppm_start += ref2;
    }
};



