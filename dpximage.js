// dpximage.js
// (c) 2019 Thomas Angarano

function readDPXFile(theFile) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    // success
    reader.onload = e => {
      let returnObject;

      try {
        returnObject = new DPXImage(e.target.result);
      } catch(error) {
        reject(error);
      }

      resolve(returnObject);
    };

    // failure
    reader.onerror = e => {
      reject(new Error(`Failed to read file ${theFile.name}`));
    };

    // start the process
    reader.readAsArrayBuffer(theFile);
  });
}

function DPXImage(fileBuffer) {
  this.dataView = new DataView(fileBuffer, false);

  const magicNum = this.dataView.getUint32(0);
  if (magicNum === 0x53445058) {
    this.littleEndian = false;
  } else if (magicNum === 0x58504453) {
    this.littleEndian = true;
  } else {
    throw new Error('Invalid format: not a DPX file');
  }

  // to access file header information
  const IIHEADER_OFFSET = 768;    // image information header
  const IMAGE_ELEMENT_SIZE = 72;  // image element info in image information header
  const elementOffset =
            element => IIHEADER_OFFSET + 12 + element * IMAGE_ELEMENT_SIZE;

  // getters for header information
  Object.defineProperties(this, { 
    'offset': {
      'value': this.dataView.getUint32(4, this.littleEndian)
    },
    'width': {
      'value': this.dataView.getUint32(IIHEADER_OFFSET + 4, this.littleEndian)
    },
    'height': {
      'value': this.dataView.getUint32(IIHEADER_OFFSET + 8, this.littleEndian)
    },
    'description': {
      'value': this.dataView.getUint8(elementOffset(0) + 20)
    },
    'bitSize': {
      'value': this.dataView.getUint8(elementOffset(0) + 23)
    },
    'numComponents': {
      'get': function() { return this.numComponentsMap.get(this.description); }
    },
    'componentsType': {
      'get': function() { return this.componentsTypesMap.get(this.description); }
    },
    'packing': {
      'value': this.dataView.getUint16(elementOffset(0) + 24, this.littleEndian)
    }
  });
}

DPXImage.prototype.numComponentsMap = new Map([
        [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1],
        [50, 3], [51, 4], [52, 4], [100, 3], [101,4], [102, 3], [103, 3],
        [150, 2], [151, 3], [152, 4], [153, 5], [154, 6], [155, 7], [156, 8]
  ]);

DPXImage.prototype.componentsTypesMap = new Map([
        [0, 'User-defined'], [1, 'Red'], [2, 'Green'], [3, 'Blue'], [4, 'Alpha'],
        [5, 'Luminance'], [6, 'Chrominance'], [7, 'Depth'],
        [8, 'Composite video'], [50, 'RGB'], [51, 'RGBA'], [52, 'ABGR'],
        [100, 'CbYCrY'], [101, 'CbYaCrYa'], [102, 'CbYCr'], [103, 'CbYCra'],
        [150, 'User-defined 2-component element'],
        [151, 'User-defined 3-component element'],
        [152, 'User-defined 4-component element'],
        [153, 'User-defined 5-component element'],
        [154, 'User-defined 6-component element'],
        [155, 'User-defined 7-component element'],
        [156, 'User-defined 8-component element']
  ]);

Object.defineProperty(DPXImage.prototype, 'imageObject', {
  'get': function() {
    if (this.hasOwnProperty('dataView')) {

      // create an (offscreen) canvas element
      const tempCanvas = document.createElement('canvas');
      if (tempCanvas instanceof HTMLUnknownElement) {
        // canvas not supported
        throw new Error('<canvas> element not supported.');
      }
      tempCanvas.width = this.width;
      tempCanvas.height = this.height;

      // get a 2d rendering context from the canvas
      const ctx = tempCanvas.getContext('2d', { alpha: false });
      if (ctx === null) {
        throw new Error('failed to get 2d context');
      }

      this.paintImage(ctx);

      // override the prototype's getter (this function) in the object with
      // the image data
      Object.defineProperty(this, 'imageObject', {
        'value': tempCanvas.toDataURL()
      });

      // clear the dataView (to free memory)
      this.dataView = null;

      // also override `paintImage` to use the new imageObject propery
      this.paintImage = function(context) {
        context.drawImage(this.imageObject, 0, 0);
      };

      return this.imageObject;
    }
    // if we get here, this getter has been called directly form the prototype
    // rather than the DPXImage
    return undefined;
  }
});

DPXImage.prototype.readComponent = function(x, y, c) {
  if (this.dataView === null) return null;

  const numComponents = this.numComponents;
  const pixelOffset = this.offset +
    (y * this.width + x) * numComponents * this.bitSize / 8;

  let component;
  if (this.bitSize === 8) {
    try {
       component = this.dataView.getUint8(pixelOffset + c);
    } catch (error) {
        throw new Error(`Failed to read image data (${x},${y}.${c},${this.bitSize},${this.description})`);
    }
  }
  if (this.bitSize === 16) {
    try {
      component = this.dataView.getUint16(pixelOffset + 2 * c, this.littleEndian) / 256;
    } catch (error) {
        throw new Error(`Failed to read image data (${x},${y}.${c},${this.bitSize},${this.description})`);
    }
  }
  if (this.bitSize === 10) {
    if (this.description === 50) {     // RGB
      const pixelOffset10 =  this.offset + (y * this.width + x) * 4;

      try {
        const pixel = this.dataView.getUint32(pixelOffset10, this.littleEndian);
        component = (pixel >>> ((2 - c) * 10 + 4)) & 0xFF;
      } catch (error) {
        throw new Error(`Failed to read image data (${x},${y}.${c},${this.bitSize},${this.description})`);
      }
    } else if (this.description === 51) {      // RGBA

      // calculate the index of this pixel's R component in the source data
      const componentBaseIndex = (y * this.width + x) * 4;    // 4 components per source pixel
      const sourceIndex = Math.floor((componentBaseIndex + c) / 3);   // 1 32bit pixel holds 3 10bit components
      const shift = 24 - ((componentBaseIndex + c) % 3) * 10;

      try {
        const pixel = this.dataView.getUint32(this.offset + sourceIndex * 4, this.littleEndian);
        component = (pixel >>> shift) & 0xFF;
      } catch (error) {
        throw new Error(`Failed to read image data (${x},${y}.${c},${this.bitSize},${this.description})`);
      }
    }
  }
  if (this.bitSize === 12) {

    // calculate the index of the component in the source data
    const sourceIndex = (y * this.width + x) * 3 + c;
    const shift = 8;

    try {
      const rawComponent = this.dataView.getUint16(this.offset + sourceIndex * 2, this.littleEndian);
      component = (rawComponent >>> shift) & 0xFF;
    } catch (error) {
      throw new Error(`Failed to read image data (${x},${y}.${c},${this.bitSize},${this.description})`);
    }
  }
  if (component === undefined) {
    throw new Error(`Unsupported pixel type: ${this.bitSize}bit ${this.componentsType}-${this.packing}`);
  }
  return component;
}

DPXImage.prototype.paintImage = function(context) {
  const components = this.numComponents;

  context.canvas.width = this.width;
  context.canvas.height = this.height;
  const destImage = context.createImageData(this.width, this.height);
  for (let y = 0; y < this.height; y++) {
    for (let x = 0; x < this.width; x++) {
      const dstPixelOffset = (y * this.width + x) * 4;

      destImage.data[dstPixelOffset + 0] = this.readComponent(x, y, 0);
      destImage.data[dstPixelOffset + 1] = this.readComponent(x, y, 1);
      destImage.data[dstPixelOffset + 2] = this.readComponent(x, y, 2);
      destImage.data[dstPixelOffset + 3] = 255;
    }
  }
  context.putImageData(destImage, 0, 0);
}
