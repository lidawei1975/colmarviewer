"use strict";

var m4 = {

    projection: function(width, height, depth) {
      // Note: This matrix flips the Y axis so 0 is at the top.
      return [
         2 / width, 0, 0, 0,
         0, -2 / height, 0, 0,
         0, 0, 2 / depth, 0,
        -1, 1, 0, 1,
      ];
    },
  
    multiply: function(a, b) {
      var a00 = a[0 * 4 + 0];
      var a01 = a[0 * 4 + 1];
      var a02 = a[0 * 4 + 2];
      var a03 = a[0 * 4 + 3];
      var a10 = a[1 * 4 + 0];
      var a11 = a[1 * 4 + 1];
      var a12 = a[1 * 4 + 2];
      var a13 = a[1 * 4 + 3];
      var a20 = a[2 * 4 + 0];
      var a21 = a[2 * 4 + 1];
      var a22 = a[2 * 4 + 2];
      var a23 = a[2 * 4 + 3];
      var a30 = a[3 * 4 + 0];
      var a31 = a[3 * 4 + 1];
      var a32 = a[3 * 4 + 2];
      var a33 = a[3 * 4 + 3];
      var b00 = b[0 * 4 + 0];
      var b01 = b[0 * 4 + 1];
      var b02 = b[0 * 4 + 2];
      var b03 = b[0 * 4 + 3];
      var b10 = b[1 * 4 + 0];
      var b11 = b[1 * 4 + 1];
      var b12 = b[1 * 4 + 2];
      var b13 = b[1 * 4 + 3];
      var b20 = b[2 * 4 + 0];
      var b21 = b[2 * 4 + 1];
      var b22 = b[2 * 4 + 2];
      var b23 = b[2 * 4 + 3];
      var b30 = b[3 * 4 + 0];
      var b31 = b[3 * 4 + 1];
      var b32 = b[3 * 4 + 2];
      var b33 = b[3 * 4 + 3];
      return [
        b00 * a00 + b01 * a10 + b02 * a20 + b03 * a30,
        b00 * a01 + b01 * a11 + b02 * a21 + b03 * a31,
        b00 * a02 + b01 * a12 + b02 * a22 + b03 * a32,
        b00 * a03 + b01 * a13 + b02 * a23 + b03 * a33,
        b10 * a00 + b11 * a10 + b12 * a20 + b13 * a30,
        b10 * a01 + b11 * a11 + b12 * a21 + b13 * a31,
        b10 * a02 + b11 * a12 + b12 * a22 + b13 * a32,
        b10 * a03 + b11 * a13 + b12 * a23 + b13 * a33,
        b20 * a00 + b21 * a10 + b22 * a20 + b23 * a30,
        b20 * a01 + b21 * a11 + b22 * a21 + b23 * a31,
        b20 * a02 + b21 * a12 + b22 * a22 + b23 * a32,
        b20 * a03 + b21 * a13 + b22 * a23 + b23 * a33,
        b30 * a00 + b31 * a10 + b32 * a20 + b33 * a30,
        b30 * a01 + b31 * a11 + b32 * a21 + b33 * a31,
        b30 * a02 + b31 * a12 + b32 * a22 + b33 * a32,
        b30 * a03 + b31 * a13 + b32 * a23 + b33 * a33,
      ];
    },
  
    translation: function(tx, ty, tz) {
      return [
         1,  0,  0,  0,
         0,  1,  0,  0,
         0,  0,  1,  0,
         tx, ty, tz, 1,
      ];
    },
  
    xRotation: function(angleInRadians) {
      var c = Math.cos(angleInRadians);
      var s = Math.sin(angleInRadians);
  
      return [
        1, 0, 0, 0,
        0, c, s, 0,
        0, -s, c, 0,
        0, 0, 0, 1,
      ];
    },
  
    yRotation: function(angleInRadians) {
      var c = Math.cos(angleInRadians);
      var s = Math.sin(angleInRadians);
  
      return [
        c, 0, -s, 0,
        0, 1, 0, 0,
        s, 0, c, 0,
        0, 0, 0, 1,
      ];
    },
  
    zRotation: function(angleInRadians) {
      var c = Math.cos(angleInRadians);
      var s = Math.sin(angleInRadians);
  
      return [
         c, s, 0, 0,
        -s, c, 0, 0,
         0, 0, 1, 0,
         0, 0, 0, 1,
      ];
    },
  
    scaling: function(sx, sy, sz) {
      return [
        sx, 0,  0,  0,
        0, sy,  0,  0,
        0,  0, sz,  0,
        0,  0,  0,  1,
      ];
    },
  
    translate: function(m, tx, ty, tz) {
      return m4.multiply(m, m4.translation(tx, ty, tz));
    },
  
    xRotate: function(m, angleInRadians) {
      return m4.multiply(m, m4.xRotation(angleInRadians));
    },
  
    yRotate: function(m, angleInRadians) {
      return m4.multiply(m, m4.yRotation(angleInRadians));
    },
  
    zRotate: function(m, angleInRadians) {
      return m4.multiply(m, m4.zRotation(angleInRadians));
    },
  
    scale: function(m, sx, sy, sz) {
      return m4.multiply(m, m4.scaling(sx, sy, sz));
    },
  
  };


class webgl_contour_plot2 {

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
                attribute vec4 a_position;
                uniform mat4 u_matrix;
                void main() {
                // Multiply the position by the matrix.
                gl_Position = u_matrix * a_position;
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
         * Disable the scissor test.
         */
        this.gl.disable(this.gl.SCISSOR_TEST);

        // Bind the position buffer.
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);

        /**
         * Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
         * In our case, the data will not change, so we will use STATIC_DRAW in load_file() call
         * and we only need to call vertexAttribPointer once when initializing the program
         */
        var size = 3;          // 2 components per iteration
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
    set_data(points) {

        this.gl.bufferData(this.gl.ARRAY_BUFFER, points, this.gl.STATIC_DRAW);
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
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        var translation = [45, 150, 0];
        var rotation = [this.degToRad(40), this.degToRad(25), this.degToRad(360)];
        var scale = [1, 1, 1];
        var color = [Math.random(), Math.random(), Math.random(), 1];

        this.gl.uniform4fv(this.colorLocation, color);

        var matrix = m4.projection(this.gl.canvas.clientWidth, this.gl.canvas.clientHeight, 400);
        matrix = m4.translate(matrix, translation[0], translation[1], translation[2]);
        matrix = m4.xRotate(matrix, rotation[0]);
        matrix = m4.yRotate(matrix, rotation[1]);
        matrix = m4.zRotate(matrix, rotation[2]);
        matrix = m4.scale(matrix, scale[0], scale[1], scale[2]);

        console.log(this.gl.canvas.clientWidth);
        console.log(this.gl.canvas.clientHeight);

        console.log(matrix);

        this.gl.uniformMatrix4fv(this.matrixLocation, false, matrix);

        var primitiveType = this.gl.TRIANGLES;

        // Draw the geometry.
        var primitiveType = this.gl.TRIANGLES;
        var offset = 0;
        var count = 18;  // 6 triangles in the 'F', 3 points per triangle
        this.gl.drawArrays(primitiveType, offset, count);
    };

};



