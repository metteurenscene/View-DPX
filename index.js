(function () {
  'use strict'

  const hideElement = element => element.classList.add('hide');
  const showElement = element => element.classList.remove('hide');

  const readFile = file => {
    const imgElement = document.getElementById('image');
    imgElement.src = '';
    const loadingElement = document.getElementById('loading-overlay');
    showElement(loadingElement);

    readDPXFile(file)
    .then(result => {
      imgElement.src = result.imageObject;
      hideElement(loadingElement);
    }).catch(error => {
      const errorMsgElem = document.getElementById('error-message');
      errorMsgElem.innerText = error.message;
      hideElement(loadingElement);
      showElement(document.getElementById('error-display'));
    });
  }

  window.onload = ev => {
    const fileDrop = document.getElementsByTagName('main')[0];
    const dropOverlay = document.getElementById('drop-overlay');
    const instructionsElement = document.getElementById('instructions');

    document.getElementById('fileinput').onchange = e => {
      hideElement(instructionsElement);
      hideElement(document.getElementById('error-display'));
      readFile(e.srcElement.files[0]);
    };

    let isDPXFile = false;

    fileDrop.addEventListener('dragenter', e => {
      e.stopPropagation();
      e.preventDefault();
    }, false);
    fileDrop.addEventListener('dragover', e => {
      e.stopPropagation();
      e.preventDefault();

      showElement(dropOverlay);
      hideElement(document.getElementById('error-display'));
    }, false);
    fileDrop.addEventListener('dragend', e => {
      e.stopPropagation();
      e.preventDefault();

      hideElement(dropOverlay);
    }, false);
    fileDrop.addEventListener('dragexit', e => {
      e.stopPropagation();
      e.preventDefault();

      hideElement(dropOverlay);
    }, false);
    fileDrop.addEventListener('drop', e => {
      e.stopPropagation();
      e.preventDefault();

      hideElement(dropOverlay);
      hideElement(instructionsElement);
      
      const dt = e.dataTransfer;
      readFile(dt.files[0]);

      // update the input element to display the file name
      document.getElementById('fileinput').files = dt.files;
    }, false);
  };
})();
