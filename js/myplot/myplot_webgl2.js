"use strict";


class webgl_contour_plot2 {

    constructor(canvas_id,points,colors,data_length,contour_result) {

        this.canvas = document.querySelector("#" + canvas_id);
        this.gl = this.canvas.getContext("webgl");
        if (!this.gl) {
            alert("No WebGL");
        }

        this.data_length = data_length/3; // number of triangles

        this.line_data_length = points.length/3 - this.data_length; // number of lines

        this.levels_length = contour_result.levels_length;
        this.polygon_length = contour_result.polygon_length;

        let vertex_shader_2d = `
                attribute vec4 a_position;
                attribute vec4 a_color;
                uniform mat4 u_matrix;
                varying vec4 v_color;
                void main() {
                // Multiply the position by the matrix.
                gl_Position = u_matrix * a_position;
                v_color = a_color;
                }
            `;

        let fragment_shader_2d = `
                precision mediump float;
                varying vec4 v_color;
                void main() {
                gl_FragColor = v_color;
                }
            `;

        // setup GLSL program
        this.program = webglUtils.createProgramFromSources(this.gl, [vertex_shader_2d, fragment_shader_2d]);

        // look up where the vertex data needs to go.
        this.positionLocation = this.gl.getAttribLocation(this.program, "a_position");

        // lookup uniforms
        this.colorLocation = this.gl.getAttribLocation(this.program, "a_color");
        this.matrixLocation = this.gl.getUniformLocation(this.program, "u_matrix");

        // Create a buffer to put positions in
        this.positionBuffer = this.gl.createBuffer();
        //bind the buffer
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        //NEXT, need to set data
        this.gl.bufferData(this.gl.ARRAY_BUFFER, points, this.gl.STATIC_DRAW);


        // Create a buffer to put colors in
        this.colorBuffer = this.gl.createBuffer();
        //bind the buffer
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, colors, this.gl.STATIC_DRAW);
            
        this.rotation_x = 0;
        this.rotation_y = 0;
        this.rotation_z = 0;

        this.translation_x = 0;
        this.translation_y = 0;
        this.translation_z = -100000;

        this.scale_x = 1;
        this.scale_y = 1;
        this.scale_z = 1;

        this.fov = 1.0;

    };

    radToDeg(r) {
        return r * 180 / Math.PI;
      };
    
    degToRad(d) {
        return d * Math.PI / 180;
      };

    /**
     * Draw the scene.
     */
    drawScene() {
        webglUtils.resizeCanvasToDisplaySize(this.gl.canvas);

        this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);

        // Clear the canvas. Set background color to white
        this.gl.clearColor(1, 1, 1, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        // Turn on culling. By default backfacing triangles
        // will be culled.
        // this.gl.enable(this.gl.CULL_FACE);

         // Enable the depth buffer
        this.gl.enable(this.gl.DEPTH_TEST);

        this.gl.useProgram(this.program);


        this.gl.enableVertexAttribArray(this.positionLocation);
        // Bind the position buffer.
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);

        /**
         * Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
         * In our case, the data will not change, so we will use STATIC_DRAW in load_file() call
         * and we only need to call vertexAttribPointer once when initializing the program
         */
        var size = 3;          // 3 components per iteration
        var type = this.gl.FLOAT;   // the data is 32bit floats
        var normalize = false; // don't normalize the data
        var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        var offset = 0;        // start at the beginning of the buffer
        this.gl.vertexAttribPointer(this.positionLocation, size, type, normalize, stride, offset);

      
        // Turn on the color attribute
        this.gl.enableVertexAttribArray(this.colorLocation);
        // Bind the color buffer.
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
        // Tell the attribute how to get data out of colorBuffer (ARRAY_BUFFER)
        var size = 3;                 // 3 components per iteration
        var type = this.gl.UNSIGNED_BYTE;  // the data is 8bit unsigned values
        var normalize = true;         // normalize the data (convert from 0-255 to 0-1)
        var stride = 0;               // 0 = move forward size * sizeof(type) each iteration to get the next position
        var offset = 0;               // start at the beginning of the buffer
        this.gl.vertexAttribPointer(this.colorLocation, size, type, normalize, stride, offset);



        var translation = [this.translation_x, this.translation_y, this.translation_z];
        var rotation = [this.degToRad(this.rotation_x), this.degToRad(this.rotation_y), this.degToRad(this.rotation_z)];
        var scale = [this.scale_x, this.scale_y, this.scale_z];


        console.log("translation: ", translation);
        console.log("rotation: ", rotation);
        console.log("scale: ", scale);
        


        // Compute the matrix
        var fieldOfViewRadians = this.degToRad(this.fov);
        var aspect = this.gl.canvas.clientWidth / this.gl.canvas.clientHeight;
        var zNear = 80000;
        var zFar = 110000;
        var matrix = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);
        matrix = m4.translate(matrix, translation[0], translation[1], translation[2]);
        matrix = m4.xRotate(matrix, rotation[0]);
        matrix = m4.yRotate(matrix, rotation[1]);
        matrix = m4.zRotate(matrix, rotation[2]);
        matrix = m4.scale(matrix, scale[0], scale[1], scale[2]);
        matrix = m4.translate(matrix, -149*4, -108*4, 0);

        /**
         * In webgl, u_matrix (matrix variable here) * a_position (position variable here) is done in the vertex shader
        
        let matrix_inverse = m4.inverse(matrix);

        let test_1 = m4.multiply_vec(matrix,[800,800,0,1]);
        let test_2 = m4.multiply_vec(matrix,[0,0,0,1]);
        console.log("test_1: ", test_1);
        console.log("test_2: ", test_2);

        
         * 46666.66666666663, 100000 are the center of the view, calculated from 
         * the near, far plane and the translation_z (fixed at -100000)
         * Rotation_x and rotation_y will affect, but only very slightly, so we can ignore them
         * Rotation_z and translation_x, translation_y will not affect the center of the view
        
        let current_view_center = [0,0, 46666.66666666663, 100000];
        console.log("current_view_center: ", current_view_center);
        let current_view_center_transformed = m4.multiply_vec(matrix_inverse, current_view_center);
        console.log("current_view_center_transformed: ", current_view_center_transformed);

        */

        let center = m4.solve_center(matrix,[0,0]);
        console.log("center: ", center);

        this.gl.uniformMatrix4fv(this.matrixLocation, false, matrix);

        // Draw all the triangles
        var primitiveType = this.gl.TRIANGLES;
        var offset = 0;
        var count =this.data_length;
        this.gl.drawArrays(primitiveType, offset, count);

        // Draw addtional lines
        // this.gl.drawArrays(this.gl.LINE_STRIP, this.data_length, this.line_data_length);

        /**
             * Draw the positive contour plot, one level at a time
             */
        for(var m=0; m < this.levels_length.length; m++)
        {
            let i_start = 0;
            let i_stop = this.levels_length[m];
            /**
             * Draw the contour plot, one polygon at a time
             */
            for (var i = i_start; i < i_stop; i++)
            {   
                let point_start = 0;
                if(i>0)
                {
                    point_start = this.polygon_length[i-1];
                }
                let count = this.polygon_length[i] - point_start;
                this.gl.drawArrays(this.gl.LINE_STRIP, this.data_length + point_start, count);
            }
        }


    };

};



