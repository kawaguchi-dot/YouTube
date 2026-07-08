/*
  Screenshot-Annotator v2
  Copyright (c) 2025 Majin
  
  Note: https://note.com/majin_108
  X: https://x.com/Majin_AppSheet
  
  [利用規約・ライセンス]
  
  1. 利用許諾
     - 購入者本人のみに利用権が付与されます。
     - 購入者本人が使用する限り、個人のPCおよび会社のPCで使用可能です。
     - 個人的な利用の範囲内であれば、自由に改変して使用できます。
  
  2. 禁止事項
     - 改変の有無にかかわらず、本ソフトウェアを第三者へ配布、公開、販売する行為
  
  3. 免責事項
     - 本ソフトウェアは「現状のまま」提供されます。
     - 本ソフトウェアの使用によって生じたいかなる損害（データ消失、業務の中断、
       予期せぬ動作等）についても、開発者は一切の責任を負いません。
     - 利用者は自己の責任において本ソフトウェアを使用するものとします。
     - Google Chromeのアップデート等で予期せぬタイミングで使えなくなる可能性があります。
       その際の保守対応は、原則として行っておりません。
*/

(function () {
  const originalTextBaselineDescriptor = Object.getOwnPropertyDescriptor(
    CanvasRenderingContext2D.prototype,
    'textBaseline'
  );

  if (originalTextBaselineDescriptor) {
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'textBaseline', {
      get: function () {
        return originalTextBaselineDescriptor.get.call(this);
      },
      set: function (value) {
        if (value === 'alphabetical') {
          value = 'alphabetic';
        }
        originalTextBaselineDescriptor.set.call(this, value);
      },
      enumerable: true,
      configurable: true
    });
  }

  console.log('Canvas textBaseline interceptor installed');
})();

(function () {
  function applyFabricFix() {
    if (typeof fabric === 'undefined' || !fabric.Object) {
      setTimeout(applyFabricFix, 10);
      return;
    }
    if (fabric.Object && fabric.Object.prototype) {
      fabric.Object.prototype.textBaseline = 'alphabetic';
    }
    if (fabric.IText && fabric.IText.prototype) {
      fabric.IText.prototype.textBaseline = 'alphabetic';
    }
    if (fabric.Text && fabric.Text.prototype) {
      fabric.Text.prototype.textBaseline = 'alphabetic';
    }

    console.log('Fabric.js textBaseline fix applied successfully');
  }

  applyFabricFix();
})();

class ScreenshotAnnotator {
  constructor() {
    const canvasElement = document.getElementById('mainCanvas');
    if (!canvasElement) {
      console.error('Canvas要素が見つかりません');
      return;
    }

    try {
      const initWidth = Math.max(window.innerWidth - 40, 800);
      const initHeight = Math.max(window.innerHeight - 130, 600);

      this.canvas = new fabric.Canvas('mainCanvas', {
        width: initWidth,
        height: initHeight,
        backgroundColor: '#ffffff',
        selection: true,
        preserveObjectStacking: true,
        enableRetinaScaling: true
      });

      fabric.Object.prototype.onSelect = function () { };
    } catch (error) {
      console.error('Canvas初期化エラー:', error);
      return;
    }

    this.currentTool = 'select';
    this.currentColor = '#FF0000';
    this.gradientStartColor = '#4285F4';
    this.gradientEndColor = '#ff52df';
    this.currentThickness = 3;
    this.currentFontSize = 24;
    this.isGradient = false;
    this.isFillEnabled = false; // 図形（四角形・円）を塗りつぶすかどうか
    this.rectCornerRadius = 8;  // 四角形の角丸半径（0で直角）
    this.isMarkerStraight = false; // マーカーを水平・垂直の直線にするか

    this.stepCounter = 1;

    this.fontSizeOptions = [12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
    this.mosaicIntensity = 10; // モザイクブロックサイズ（強度）
    this.mosaicIntensityOptions = [4, 6, 8, 10, 12, 16, 20, 26, 34, 44, 56];
    this.isDrawing = false;
    this.drawingObject = null;
    this.startPoint = null;
    this.pendingTextPosition = null;
    this.isTextEditing = false;
    this.editingTextObject = null;
    this.originalCanvasWidth = 0;
    this.previewCanvasWidth = 0;
    this.history = [];
    this.historyStep = -1;
    this.isLoadingState = false;

    this.isVideoLoopRunning = false;
    this.isSeeking = false;

    // [改善2] Undo/Redo最適化: 背景画像を別管理
    this.backgroundImageDataURL = null;

    this.init();
  }

  async init() {
    try {
      if (!this.canvas || !this.canvas.getElement()) {
        console.error('Canvas初期化に失敗しました');
        return;
      }

      this.setupEventListeners();
      this.setupCanvasEvents();
      this.setupRotationSnap();
      await this.loadColorSettings();
      this.loadState();

      this.updateThicknessSliderBackground(document.getElementById('thicknessPicker'));
      this.updateFontSizeSliderBackground(document.getElementById('fontSizePicker'));

      this.canvas.wrapperEl.setAttribute('tabindex', '1');
      this.canvas.wrapperEl.focus();

      const canvasSizeSelect = document.getElementById('canvasSizeSelect');
      if (canvasSizeSelect) {
        const initialSize = canvasSizeSelect.value || 'free';
        this.applyCanvasSize(initialSize);
      }

      this.canvas.renderAll();

      this.canvas.forEachObject(obj => {
        if (obj.type === 'i-text' || obj.type === 'text') {
          if (obj.textBaseline === 'alphabetical' || !obj.textBaseline) {
            obj.set('textBaseline', 'alphabetic');
          }
        }
      });
      this.canvas.renderAll();

      // [改善3] コンテキストアウェア: 初期状態を適用
      this.updateContextAwareUI();

    } catch (error) {
      console.error('初期化エラー:', error);
    }
  }

  resizeCanvas(width, height) {
    this.canvas.setWidth(width);
    this.canvas.setHeight(height);
    this.centerCanvas();
    this.canvas.renderAll();
  }

  resizeCanvasToWindow() {
    const width = Math.max(window.innerWidth - 40, 800);
    const height = Math.max(window.innerHeight - 130, 600);
    this.resizeCanvas(width, height);
  }

  resizeCanvasWithAspectRatio(aspectRatio) {
    const container = document.getElementById('canvasContainer');
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const padding = 40;
    const availableWidth = containerWidth - padding;
    const availableHeight = containerHeight - padding;

    let width, height;

    if (aspectRatio === '16:9') {
      if (availableWidth / availableHeight > 16 / 9) {
        height = availableHeight;
        width = height * (16 / 9);
      } else {
        width = availableWidth;
        height = width * (9 / 16);
      }
    } else if (aspectRatio === '4:3') {
      if (availableWidth / availableHeight > 4 / 3) {
        height = availableHeight;
        width = height * (4 / 3);
      } else {
        width = availableWidth;
        height = width * (3 / 4);
      }
    }

    this.resizeCanvas(Math.floor(width), Math.floor(height));
  }

  showCanvasSizeConfirmation(newValue) {
    const modal = document.getElementById('canvasSizeModal');
    const confirmBtn = document.getElementById('canvasSizeModalConfirm');
    const cancelBtn = document.getElementById('canvasSizeModalCancel');
    const closeBtn = document.getElementById('canvasSizeModalClose');
    const select = document.getElementById('canvasSizeSelect');

    modal.classList.add('active');

    const handleConfirm = () => {
      this.applyCanvasSize(newValue);
      this.canvas.clear();
      this.canvas.backgroundColor = '#ffffff';
      this.previousCanvasSize = newValue;
      // [改善2] 背景画像もクリア
      this.backgroundImageDataURL = null;
      this.saveState();
      modal.classList.remove('active');
      cleanup();
    };

    const handleCancel = () => {
      select.value = this.previousCanvasSize;
      modal.classList.remove('active');
      cleanup();
    };

    const cleanup = () => {
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      closeBtn.removeEventListener('click', handleCancel);
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    closeBtn.addEventListener('click', handleCancel);
  }

  applyCanvasSize(value) {
    if (value === 'free') {
      this.resizeCanvasToWindow();
    } else {
      this.resizeCanvasWithAspectRatio(value);
    }
  }

  setupEventListeners() {
    document.getElementById('selectTool').addEventListener('click', () => this.setTool('select'));
    document.getElementById('textTool').addEventListener('click', () => this.setTool('text'));
    document.getElementById('stepTool').addEventListener('click', () => this.setTool('step'));
    document.getElementById('rectTool').addEventListener('click', () => this.setTool('rect'));
    document.getElementById('ellipseTool').addEventListener('click', () => this.setTool('ellipse'));
    document.getElementById('arrowTool').addEventListener('click', () => this.setTool('arrow'));
    document.getElementById('markerTool').addEventListener('click', () => this.setTool('marker'));
    document.getElementById('mosaicTool').addEventListener('click', () => this.setTool('mosaic'));

    const fillToggle = document.getElementById('fillToggle');
    if (fillToggle) {
      fillToggle.addEventListener('change', (e) => {
        this.isFillEnabled = e.target.checked;
        this.updateSelectedObjectFill();
        this.saveColorSettings();
      });
    }

    const cornerToggle = document.getElementById('cornerToggle');
    if (cornerToggle) {
      cornerToggle.addEventListener('change', (e) => {
        this.rectCornerRadius = e.target.checked ? 8 : 0;
        this.updateSelectedObjectCorner();
        this.saveColorSettings();
      });
    }

    const markerStraightToggle = document.getElementById('markerStraightToggle');
    if (markerStraightToggle) {
      markerStraightToggle.addEventListener('change', (e) => {
        this.isMarkerStraight = e.target.checked;
        // マーカー使用中なら描画方式を即切り替え（フリーハンド⇔直線）
        if (this.currentTool === 'marker') this.enableMarkerMode();
        this.saveColorSettings();
      });
    }

    // ブランドロゴ: icons/logo.png があれば画像、無ければ Nextstep のテキスト表示
    this.setupBrandLogo();

    document.querySelectorAll('.color-preset').forEach(preset => {
      preset.addEventListener('click', (e) => {
        const color = e.target.dataset.color;
        const isGradient = e.target.dataset.gradient === 'true';

        if (isGradient) {
          this.setGradient();
        } else {
          this.setColor(color, false);
        }
      });
    });

    const colorPickerEl = document.getElementById('colorPicker');
    colorPickerEl.addEventListener('mousedown', () => {
      const active = this.canvas.getActiveObjects();
      this._colorPickerTargets = active.length
        ? [...active]
        : (this.canvas.getActiveObject() ? [this.canvas.getActiveObject()] : []);
    });
    const applyPickedColor = (e) => {
      this.setColor(e.target.value, false, this._colorPickerTargets);
      if (this.canvas.wrapperEl) this.canvas.wrapperEl.focus();
    };
    colorPickerEl.addEventListener('input', applyPickedColor);
    colorPickerEl.addEventListener('change', applyPickedColor);

    document.getElementById('gradientStartPicker').addEventListener('input', (e) => {
      this.gradientStartColor = e.target.value;
      this.updateGradientButtonPreview();
      this.updateSelectedObjectColor();
      this.saveColorSettings();
    });

    document.getElementById('gradientEndPicker').addEventListener('input', (e) => {
      this.gradientEndColor = e.target.value;
      this.updateGradientButtonPreview();
      this.updateSelectedObjectColor();
      this.saveColorSettings();
    });

    document.getElementById('thicknessPicker').addEventListener('input', (e) => {
      this.currentThickness = parseInt(e.target.value);
      document.getElementById('thicknessValue').textContent = this.currentThickness;
      this.updateThicknessSliderBackground(e.target);
      this.updateSelectedObjectThickness();
      if (this.currentTool === 'marker') this.updateMarkerBrush();
      this.saveColorSettings();
    });

    document.getElementById('fontSizePicker').addEventListener('input', (e) => {
      const index = parseInt(e.target.value);
      
      // モザイクツール時 or 選択ツールでモザイクオブジェクト選択中
      const activeObj = this.canvas.getActiveObject();
      const isMosaicMode = this.currentTool === 'mosaic' || 
        (this.currentTool === 'select' && activeObj && activeObj.isMosaic && activeObj.mosaicOriginalDataURL);
      
      if (isMosaicMode) {
        const intensity = this.mosaicIntensityOptions[index];
        this.mosaicIntensity = intensity;
        document.getElementById('fontSizeValue').textContent = intensity;
        this.saveColorSettings();

        // 選択ツールでモザイク選択中なら、強度を再適用
        if (this.currentTool === 'select' && activeObj && activeObj.isMosaic && activeObj.mosaicOriginalDataURL) {
          this.reapplyMosaicIntensity(activeObj, intensity);
        }
      } else {
        const fontSize = this.fontSizeOptions[index];
        this.setFontSize(fontSize);
      }
      this.updateFontSizeSliderBackground(e.target);
    });

    document.getElementById('undoBtn').addEventListener('click', () => this.undo());
    document.getElementById('redoBtn').addEventListener('click', () => this.redo());
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileSelect(e));
    document.getElementById('saveBtn').addEventListener('click', () => this.handleSave());
    document.getElementById('copyBtn').addEventListener('click', () => this.handleCopy());

    // トリミングモーダルのイベントリスナー
    const cropModalClose = document.getElementById('cropModalClose');
    if (cropModalClose) {
      cropModalClose.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideCropModal();
      });
    }
    const cropModal = document.getElementById('cropModal');
    if (cropModal) {
      cropModal.addEventListener('click', (e) => {
        if (e.target === cropModal || e.target.classList.contains('help-modal-overlay')) {
          this.hideCropModal();
        }
      });
    }
    const cropResetBtn = document.getElementById('cropResetBtn');
    if (cropResetBtn) {
      cropResetBtn.addEventListener('click', () => this.resetCropToAuto());
    }
    const cropSaveBtn = document.getElementById('cropSaveBtn');
    if (cropSaveBtn) {
      cropSaveBtn.addEventListener('click', () => this.executeCropSave());
    }
    const cropCopyBtn = document.getElementById('cropCopyBtn');
    if (cropCopyBtn) {
      cropCopyBtn.addEventListener('click', () => this.executeCropCopy());
    }
    document.getElementById('clearBtn').addEventListener('click', () => this.clearCanvas());

    document.getElementById('bringToTopBtn').addEventListener('click', () => this.bringToTop());
    document.getElementById('bringToFrontBtn').addEventListener('click', () => this.bringToFront());
    document.getElementById('sendToBackBtn').addEventListener('click', () => this.sendToBack());
    document.getElementById('sendToBottomBtn').addEventListener('click', () => this.sendToBottom());


    // Canvas Size Select with Confirmation
    const canvasSizeSelect = document.getElementById('canvasSizeSelect');
    if (canvasSizeSelect) {
      this.previousCanvasSize = canvasSizeSelect.value;

      canvasSizeSelect.addEventListener('change', (e) => {
        const newValue = e.target.value;
        const hasObjects = this.canvas.getObjects().length > 0;

        if (hasObjects && newValue !== this.previousCanvasSize) {
          this.showCanvasSizeConfirmation(newValue);
        } else {
          this.applyCanvasSize(newValue);
          this.previousCanvasSize = newValue;
        }
        this.saveColorSettings();
      });
    }

    // 範囲指定トグルの変更を保存
    const cropToggle = document.getElementById('cropToggle');
    if (cropToggle) {
      cropToggle.addEventListener('change', () => {
        this.saveColorSettings();
      });
    }

    window.addEventListener('resize', () => {
      const currentSize = document.getElementById('canvasSizeSelect').value;
      if (currentSize === 'free') {
        this.resizeCanvasToWindow();
      } else {
        this.resizeCanvasWithAspectRatio(currentSize);
      }
    });

    document.getElementById('videoPlayPauseBtn').addEventListener('click', () => this.toggleVideoPlayPause());
    document.getElementById('videoMuteBtn').addEventListener('click', () => this.toggleVideoMute());
    document.getElementById('videoLoopBtn').addEventListener('click', () => this.toggleVideoLoop());

    const seekBar = document.getElementById('videoSeekBar');
    seekBar.addEventListener('input', (e) => this.onSeekBarInput(e));
    seekBar.addEventListener('change', (e) => this.onSeekBarChange(e));
    seekBar.addEventListener('mousedown', () => this.isSeeking = true);
    seekBar.addEventListener('mouseup', () => this.isSeeking = false);

    window.addEventListener('paste', (e) => this.onPaste(e));

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      this.onDrop(e);
    });


    window.addEventListener('keydown', (e) => {
      const target = e.target;
      const isFormField =
        target instanceof HTMLElement &&
        !!target.closest('input, textarea, select, [contenteditable="true"]');
      if (isFormField) return;

      const isCtrl = e.ctrlKey || e.metaKey;

      const isTextEditing = this.isInTextEditingMode();

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (isTextEditing) {
          return;
        }

        const ao = this.canvas.getActiveObject();
        if (ao || this.canvas.getActiveObjects().length > 0) {
          e.preventDefault();
          this.deleteSelected();
          return;
        }
      }

      if (isCtrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
        return;
      }

      if (isCtrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        this.redo();
        return;
      }

      // Ctrl+D: 選択オブジェクトを複製（テキストボックスもコピー可能）
      if (isCtrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        this.duplicateSelected();
        return;
      }

      if (e.key === 'Escape' && this.isTextEditing) {
        this.finishTextEditing();
        return;
      }

      // [改善UI-1] ツールショートカットキー（テキスト編集中は無効）
      if (!isTextEditing && !isCtrl && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'v':
            e.preventDefault();
            this.setTool('select');
            break;
          case 't':
            e.preventDefault();
            this.setTool('text');
            break;
          case 'r':
            e.preventDefault();
            this.setTool('rect');
            break;
          case 'c':
            e.preventDefault();
            this.setTool('ellipse');
            break;
          case 'a':
            e.preventDefault();
            this.setTool('arrow');
            break;
          case 'p':
            e.preventDefault();
            this.setTool('marker');
            break;
          case 'm':
            e.preventDefault();
            this.setTool('mosaic');
            break;
        }
      }
    });

    document.getElementById('duplicateObject').addEventListener('click', () => {
      this.duplicateSelected();
      this.hideContextMenu();
    });
    document.getElementById('deleteObject').addEventListener('click', () => {
      this.deleteSelected();
      this.hideContextMenu();
    });
    document.getElementById('bringToFront').addEventListener('click', () => {
      this.bringToFront();
      this.hideContextMenu();
    });
    document.getElementById('sendToBack').addEventListener('click', () => {
      this.sendToBack();
      this.hideContextMenu();
    });

    document.getElementById('saveDialogOk').addEventListener('click', () => this.saveImage());
    document.getElementById('saveDialogCancel').addEventListener('click', () => this.hideSaveDialog());
    document.getElementById('filenameInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.saveImage();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.context-menu')) {
        this.hideContextMenu();
      }
    });
  }

  setupCanvasEvents() {
    this.canvas.on('mouse:down', (options) => {
      const pointer = this.canvas.getPointer(options.e);

      if (this.currentTool === 'step') {
        this.addStepMarker(pointer.x, pointer.y);
        return;
      }

      if (this.currentTool === 'text') {
        this.createTextObject(pointer.x, pointer.y);
        return;
      }

      // マーカー: 直線モードは手動描画、フリーハンドは fabric に任せる
      if (this.currentTool === 'marker') {
        if (this.isMarkerStraight) {
          this.startPoint = { x: pointer.x, y: pointer.y };
          this.isDrawing = true;
          this.startDrawingMarkerLine(pointer);
        }
        return;
      }

      if (this.currentTool === 'select') return;

      this.startPoint = { x: pointer.x, y: pointer.y };
      this.isDrawing = true;

      if (this.currentTool === 'rect') {
        this.startDrawingRect(pointer);
      } else if (this.currentTool === 'ellipse') {
        this.startDrawingEllipse(pointer);
      } else if (this.currentTool === 'arrow') {
        this.startDrawingArrow(pointer);
      } else if (this.currentTool === 'mosaic') {
        this.startDrawingMosaic(pointer);
      }
    });

    this.canvas.on('mouse:dblclick', (options) => {
      const activeObject = this.canvas.getActiveObject();
      if (activeObject && (activeObject.type === 'i-text' || activeObject.type === 'text')) {
        this.editTextObject(activeObject, options ? options.e : null);
      }
    });

    this.canvas.on('mouse:move', (options) => {
      if (!this.isDrawing || this.currentTool === 'select' || this.currentTool === 'text') return;

      const pointer = this.canvas.getPointer(options.e);

      if (this.currentTool === 'rect' && this.drawingObject) {
        this.updateDrawingRect(pointer);
      } else if (this.currentTool === 'ellipse' && this.drawingObject) {
        this.updateDrawingEllipse(pointer);
      } else if (this.currentTool === 'arrow' && this.drawingObject) {
        this.updateDrawingArrow(pointer);
      } else if (this.currentTool === 'marker' && this.isMarkerStraight && this.drawingObject) {
        this.updateDrawingMarkerLine(pointer);
      } else if (this.currentTool === 'mosaic' && this.drawingObject) {
        this.updateDrawingMosaic(pointer);
      }
    });

    this.canvas.on('mouse:up', (options) => {
      if (!this.isDrawing) return;

      this.isDrawing = false;

      if (this.drawingObject) {
        if (this.currentTool === 'mosaic') {
          this.applyMosaic();
        } else if (this.currentTool === 'arrow') {
          this.finishArrow();
        } else if (this.currentTool === 'marker') {
          this.finishMarkerLine();
        } else {
          const obj = this.drawingObject;
          // ドラッグせずにクリックしただけの極小図形は誤操作とみなして破棄
          const isTinyShape =
            (obj.type === 'rect' && obj.width < 3 && obj.height < 3) ||
            (obj.type === 'ellipse' && obj.rx < 2 && obj.ry < 2);

          if (isTinyShape) {
            this.canvas.remove(obj);
            this.canvas.renderAll();
            this.drawingObject = null;
            this.setTool('select');
          } else {
            obj.set({
              selectable: true,
              evented: true,
              hasControls: true,
              hasBorders: true,
              lockRotation: false,
              lockScalingX: false,
              lockScalingY: false,
              lockUniScaling: false
            });

            this.canvas.setActiveObject(obj);
            this.canvas.renderAll();
            this.drawingObject = null;
            this.saveState();

            this.setTool('select');
          }
        }
      }

      this.startPoint = null;
    });

    this.canvas.on('object:modified', () => {
      this.saveState();
    });

    // マーカー（フリーハンド）のストローク確定
    this.canvas.on('path:created', (e) => {
      const path = e.path;
      if (!path) return;
      path.isMarker = true;
      path.selectable = this.currentTool === 'select';
      path.evented = this.currentTool === 'select';
      path.strokeLineCap = 'round';
      path.strokeLineJoin = 'round';
      this.canvas.renderAll();
      this.saveState();
    });

    this.canvas.on('selection:created', (e) => {
      this.showLayerControls();
      this.updateVideoControlsVisibility();
      this.updateMosaicIntensityUI();
    });

    this.canvas.on('selection:updated', (e) => {
      this.showLayerControls();
      this.updateVideoControlsVisibility();
      this.updateMosaicIntensityUI();
    });

    this.canvas.on('selection:cleared', () => {
      this.hideLayerControls();
      this.hideVideoControls();
      this.updateMosaicIntensityUI();
    });

    this.canvas.on('object:selected', (e) => {
    });

    this.canvas.on('object:rotating', (e) => {
      this.applyRotationSnap(e.target);
    });

    this.canvas.on('mouse:down', (options) => {
      if (options.e.button === 2) { // 右クリック
        options.e.preventDefault();
        const activeObject = this.canvas.getActiveObject();
        if (activeObject) {
          this.showContextMenu(options.e.clientX, options.e.clientY);
        }
      }
    });

    this.canvas.wrapperEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  // [改善UI-3] コンテキストアウェアなプロパティ表示
  // モザイクオブジェクト選択時にスライダーを強度モードに切り替える
  updateMosaicIntensityUI() {
    const activeObj = this.canvas.getActiveObject();
    const fontSizeGroup = document.getElementById('fontSizeGroup');
    const fontSizePicker = document.getElementById('fontSizePicker');
    const fontSizeValue = document.getElementById('fontSizeValue');
    const fontLabelText = document.getElementById('fontSizeLabelText');

    if (activeObj && activeObj.isMosaic && activeObj.mosaicOriginalDataURL && this.currentTool === 'select') {
      // モザイクオブジェクトが選択されている → 強度モードに切り替え
      if (fontLabelText) {
        fontLabelText.textContent = '\u5F37\u5EA6:';
      }
      if (fontSizeGroup) {
        fontSizeGroup.classList.remove('context-disabled');
      }
      const currentIntensity = activeObj.mosaicIntensity || this.mosaicIntensity;
      if (fontSizePicker) {
        const intensityIndex = this.mosaicIntensityOptions.indexOf(currentIntensity);
        fontSizePicker.value = intensityIndex >= 0 ? intensityIndex : 3;
        this.updateFontSizeSliderBackground(fontSizePicker);
      }
      if (fontSizeValue) {
        fontSizeValue.textContent = currentIntensity;
      }
      this._mosaicIntensityMode = true;
    } else {
      // モザイク以外が選択されている or 選択解除 → 通常モードに戻す
      if (this._mosaicIntensityMode && this.currentTool === 'select') {
        if (fontLabelText) {
          fontLabelText.textContent = '\u30D5\u30A9\u30F3\u30C8:';
        }
        if (fontSizePicker) {
          const fontIndex = this.fontSizeOptions.indexOf(this.currentFontSize);
          fontSizePicker.value = fontIndex >= 0 ? fontIndex : 5;
          this.updateFontSizeSliderBackground(fontSizePicker);
        }
        if (fontSizeValue) {
          fontSizeValue.textContent = this.currentFontSize;
        }
        this._mosaicIntensityMode = false;
      }
      // 選択ツールの場合のグレーアウト状態を再適用
      if (this.currentTool === 'select') {
        this.updateContextAwareUI();
      }
    }
  }

  updateContextAwareUI() {
    const thicknessGroup = document.getElementById('thicknessGroup');
    const fontSizeGroup = document.getElementById('fontSizeGroup');
    if (!thicknessGroup || !fontSizeGroup) return;

    const tool = this.currentTool;

    // モザイク強度モードのラベル・値切り替え
    const fontLabelText = document.getElementById('fontSizeLabelText');
    const fontSizePicker = document.getElementById('fontSizePicker');
    const fontSizeValue = document.getElementById('fontSizeValue');
    if (tool === 'mosaic') {
      // フォントスライダーを「強度」に切り替え
      if (fontLabelText) {
        fontLabelText.textContent = '\u5F37\u5EA6:';
      }
      // スライダーの値をモザイク強度に切り替え
      if (fontSizePicker) {
        const intensityIndex = this.mosaicIntensityOptions.indexOf(this.mosaicIntensity);
        fontSizePicker.value = intensityIndex >= 0 ? intensityIndex : 3;
        this.updateFontSizeSliderBackground(fontSizePicker);
      }
      if (fontSizeValue) {
        fontSizeValue.textContent = this.mosaicIntensity;
      }
      thicknessGroup.classList.remove('context-disabled');
      fontSizeGroup.classList.remove('context-disabled');
    } else {
      // 通常のラベルに戻す
      if (fontLabelText) {
        fontLabelText.textContent = '\u30D5\u30A9\u30F3\u30C8:';
      }
      // スライダーの値をフォントサイズに戻す
      if (fontSizePicker) {
        const fontIndex = this.fontSizeOptions.indexOf(this.currentFontSize);
        fontSizePicker.value = fontIndex >= 0 ? fontIndex : 5;
        this.updateFontSizeSliderBackground(fontSizePicker);
      }
      if (fontSizeValue) {
        fontSizeValue.textContent = this.currentFontSize;
      }
    }

    // テキスト/ステップマーカー: 太さをグレーアウト
    if (tool === 'text' || tool === 'step') {
      thicknessGroup.classList.add('context-disabled');
      fontSizeGroup.classList.remove('context-disabled');
    }
    // 矢印/四角形/円/マーカー: フォントをグレーアウト
    else if (tool === 'rect' || tool === 'ellipse' || tool === 'arrow' || tool === 'marker') {
      thicknessGroup.classList.remove('context-disabled');
      fontSizeGroup.classList.add('context-disabled');
    }
    // モザイク: 両方有効（太さ＋強度）
    else if (tool === 'mosaic') {
      thicknessGroup.classList.remove('context-disabled');
      fontSizeGroup.classList.remove('context-disabled');
    }
    // 選択ツール: 両方有効
    else {
      thicknessGroup.classList.remove('context-disabled');
      fontSizeGroup.classList.remove('context-disabled');
    }

    // 塗りつぶしトグル: 図形ツール（四角形・円）と選択ツールでのみ有効化
    const fillToggleLabel = document.getElementById('fillToggleLabel');
    if (fillToggleLabel) {
      const fillRelevant = (tool === 'rect' || tool === 'ellipse' || tool === 'select');
      fillToggleLabel.classList.toggle('context-disabled', !fillRelevant);
    }

    // 角丸トグル: 四角形ツールと選択ツール（四角形選択時）でのみ有効化
    const cornerToggleLabel = document.getElementById('cornerToggleLabel');
    if (cornerToggleLabel) {
      const cornerRelevant = (tool === 'rect' || tool === 'select');
      cornerToggleLabel.classList.toggle('context-disabled', !cornerRelevant);
    }

    // 直線（水平/垂直）トグル: マーカーツールでのみ有効化
    const markerStraightLabel = document.getElementById('markerStraightToggleLabel');
    if (markerStraightLabel) {
      markerStraightLabel.classList.toggle('context-disabled', tool !== 'marker');
    }
  }

  setTool(tool) {
    if (tool !== 'step') {
      this.stepCounter = 1;
    }

    this.currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));

    const btnId = tool + 'Tool';
    const btnElement = document.getElementById(btnId);
    if (btnElement) btnElement.classList.add('active');

    if (tool === 'select') {
      this.canvas.selection = true;
      this.canvas.forEachObject(obj => {
        obj.selectable = true;
        obj.evented = true;
      });
      this.canvas.defaultCursor = 'default';
    } else {
      this.canvas.selection = false;
      this.canvas.forEachObject(obj => {
        obj.selectable = false;
        obj.evented = false;
      });
      this.canvas.defaultCursor = 'crosshair';
      this.canvas.discardActiveObject();
      this.canvas.renderAll();
    }

    // マーカー: fabric のフリードローイングモードを有効化
    if (tool === 'marker') {
      this.enableMarkerMode();
    } else {
      this.canvas.isDrawingMode = false;
    }

    // [改善UI-3] ツール切替時にコンテキストアウェアUI更新
    this.updateContextAwareUI();
  }

  // マーカーモードを有効化。直線モードなら独自ハンドラで水平/垂直の線を描く
  enableMarkerMode() {
    if (this.isMarkerStraight) {
      // 直線（水平/垂直）モード: fabric のフリードローイングは使わず手動描画
      this.canvas.isDrawingMode = false;
      return;
    }
    this.canvas.isDrawingMode = true;
    if (!this.canvas.freeDrawingBrush) {
      this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
    }
    this.updateMarkerBrush();
  }

  // ブラシの色・太さを現在の設定に合わせて更新
  updateMarkerBrush() {
    const brush = this.canvas.freeDrawingBrush;
    if (!brush) return;
    // グラデーションはブラシに適用できないため開始色でフォールバック
    brush.color = this.isGradient ? this.gradientStartColor : this.currentColor;
    brush.width = this.currentThickness;
    if ('strokeLineCap' in brush) brush.strokeLineCap = 'round';
    if ('strokeLineJoin' in brush) brush.strokeLineJoin = 'round';
  }

  // 直線マーカー（水平/垂直）の色を取得
  getMarkerLineColor() {
    return this.isGradient ? this.gradientStartColor : this.currentColor;
  }

  startDrawingMarkerLine(pointer) {
    this.drawingObject = new fabric.Line(
      [pointer.x, pointer.y, pointer.x, pointer.y],
      {
        stroke: this.getMarkerLineColor(),
        strokeWidth: this.currentThickness,
        strokeLineCap: 'round',
        strokeUniform: true,
        selectable: false,
        evented: false,
        isMarker: true
      }
    );
    this.canvas.add(this.drawingObject);
  }

  updateDrawingMarkerLine(pointer) {
    if (!this.drawingObject || !this.startPoint) return;

    const dx = pointer.x - this.startPoint.x;
    const dy = pointer.y - this.startPoint.y;

    // ドラッグ方向が横に長ければ水平、縦に長ければ垂直にスナップ
    let x2, y2;
    if (Math.abs(dx) >= Math.abs(dy)) {
      x2 = pointer.x;
      y2 = this.startPoint.y;
    } else {
      x2 = this.startPoint.x;
      y2 = pointer.y;
    }

    // fabric.Line は座標変更後の境界更新のため作り直す（矢印と同方式）
    this.canvas.remove(this.drawingObject);
    this.drawingObject = new fabric.Line(
      [this.startPoint.x, this.startPoint.y, x2, y2],
      {
        stroke: this.getMarkerLineColor(),
        strokeWidth: this.currentThickness,
        strokeLineCap: 'round',
        strokeUniform: true,
        selectable: false,
        evented: false,
        isMarker: true
      }
    );
    this.canvas.add(this.drawingObject);
    this.canvas.renderAll();
  }

  finishMarkerLine() {
    if (!this.drawingObject) return;
    const line = this.drawingObject;

    // クリックのみ（極小）の線は破棄
    const len = Math.hypot((line.x2 - line.x1), (line.y2 - line.y1));
    if (len < 3) {
      this.canvas.remove(line);
      this.canvas.renderAll();
      this.drawingObject = null;
      return;
    }

    const inSelect = this.currentTool === 'select';
    line.set({
      selectable: inSelect,
      evented: inSelect,
      hasControls: true,
      hasBorders: true
    });
    this.canvas.renderAll();
    this.drawingObject = null;
    this.saveState();
    // マーカーツールは継続（select には切り替えない）
  }

  addStepMarker(x, y) {
    let fillStyle = this.currentColor;

    if (this.isGradient) {
      fillStyle = new fabric.Gradient({
        type: 'linear',
        coords: { x1: -15, y1: 0, x2: 15, y2: 0 },
        colorStops: [
          { offset: 0, color: this.gradientStartColor },
          { offset: 1, color: this.gradientEndColor }
        ]
      });
    }

    const circle = new fabric.Circle({
      radius: 15,
      fill: fillStyle,
      originX: 'center',
      originY: 'center',
      stroke: '#ffffff',
      strokeWidth: 2
    });

    const text = new fabric.Text(this.stepCounter.toString(), {
      fontSize: 18,
      fontFamily: 'Noto Sans JP',
      fontWeight: 'bold',
      fill: '#ffffff',
      originX: 'center',
      originY: 'center',
      top: 1
    });

    const group = new fabric.Group([circle, text], {
      left: x,
      top: y,
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
      lockRotation: true,
      lockUniScaling: true,
      isStepMarker: true
    });

    this.canvas.add(group);
    this.canvas.setActiveObject(group);
    this.canvas.renderAll();
    this.saveState();

    this.stepCounter++;
  }

  autoBringToFront(selectedObjects) {
    if (selectedObjects && selectedObjects.length > 0) {
      selectedObjects.forEach(obj => {
        obj.bringToFront();
      });
      this.canvas.renderAll();
    }
  }

  setColor(color, isGradient = false, targets = null) {
    this.currentColor = color;
    this.isGradient = isGradient;

    const colorPicker = document.getElementById('colorPicker');
    const gradientSettings = document.getElementById('gradientSettings');

    if (isGradient) {
      colorPicker.style.display = 'none';
      gradientSettings.style.display = 'flex';
    } else {
      colorPicker.style.display = 'block';
      gradientSettings.style.display = 'none';
      if (colorPicker) colorPicker.value = color;
    }

    document.querySelectorAll('.color-preset').forEach(preset => {
      preset.classList.remove('active');
      if (preset.dataset.color === color || (isGradient && preset.dataset.gradient === 'true')) {
        preset.classList.add('active');
      }
    });

    this.updateSelectedObjectColor(targets);
    if (this.currentTool === 'marker') this.updateMarkerBrush();
    this.saveColorSettings();
  }

  setGradient() {
    this.isGradient = true;
    this.setColor(null, true);
  }

  updateGradientButtonPreview() {
    const btn = document.getElementById('gradientPresetBtn');
    if (btn) {
      btn.style.background = `linear-gradient(45deg, ${this.gradientStartColor}, ${this.gradientEndColor})`;
    }
  }

  createGradient(object = null) {
    const gradient = new fabric.Gradient({
      type: 'linear',
      coords: {
        x1: 0,
        y1: 0,
        x2: object ? object.width || 100 : 100,
        y2: 0
      },
      colorStops: [
        { offset: 0, color: this.gradientStartColor },
        { offset: 1, color: this.gradientEndColor }
      ]
    });
    return gradient;
  }

  createTextGradient(textObject = null) {
    const gradient = new fabric.Gradient({
      type: 'linear',
      coords: {
        x1: 0,
        y1: 0,
        x2: textObject ? textObject.width || 200 : 200,
        y2: 0
      },
      colorStops: [
        { offset: 0, color: this.gradientStartColor },
        { offset: 1, color: this.gradientEndColor }
      ]
    });
    return gradient;
  }

  // 図形の枠線スタイル（単色 or グラデーション）を取得
  getShapeStrokeStyle(width) {
    return this.isGradient
      ? this.createGradient({ width: Math.max(width || 200, 100) })
      : this.currentColor;
  }

  // 図形の塗りつぶしスタイルを取得（塗りつぶしOFFなら透明）
  getShapeFillStyle(width) {
    if (!this.isFillEnabled) return 'transparent';
    return this.isGradient
      ? this.createTextGradient({ width: Math.max(width || 200, 100) })
      : this.currentColor;
  }

  startDrawingRect(pointer) {
    try {
      const fillEnabled = this.isFillEnabled;

      this.drawingObject = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        fill: this.getShapeFillStyle(200),
        stroke: fillEnabled ? 'transparent' : this.getShapeStrokeStyle(200),
        strokeWidth: fillEnabled ? 0 : this.currentThickness,
        strokeUniform: true,
        selectable: false,
        evented: false,
        strokeLineJoin: 'round',
        strokeLineCap: 'round',
        rx: this.rectCornerRadius,
        ry: this.rectCornerRadius
      });
      this.canvas.add(this.drawingObject);
    } catch (error) {
      console.error('Rectangle drawing error:', error);
    }
  }

  updateDrawingRect(pointer) {
    if (!this.drawingObject || !this.startPoint) {
      return;
    }

    try {
      const width = pointer.x - this.startPoint.x;
      const height = pointer.y - this.startPoint.y;
      const rectWidth = Math.abs(width);
      const rectHeight = Math.abs(height);

      if (this.isGradient) {
        if (this.drawingObject.stroke && typeof this.drawingObject.stroke === 'object') {
          this.drawingObject.set('stroke', this.createGradient({ width: Math.max(rectWidth, 100) }));
        }
        if (this.drawingObject.fill && typeof this.drawingObject.fill === 'object') {
          this.drawingObject.set('fill', this.createTextGradient({ width: Math.max(rectWidth, 100) }));
        }
      }

      this.drawingObject.set({
        left: width < 0 ? pointer.x : this.startPoint.x,
        top: height < 0 ? pointer.y : this.startPoint.y,
        width: rectWidth,
        height: rectHeight
      });
      this.canvas.renderAll();
    } catch (error) {
      console.error('Rectangle update error:', error);
    }
  }

  startDrawingEllipse(pointer) {
    try {
      const fillEnabled = this.isFillEnabled;

      this.drawingObject = new fabric.Ellipse({
        left: pointer.x,
        top: pointer.y,
        rx: 0,
        ry: 0,
        originX: 'left',
        originY: 'top',
        fill: this.getShapeFillStyle(200),
        stroke: fillEnabled ? 'transparent' : this.getShapeStrokeStyle(200),
        strokeWidth: fillEnabled ? 0 : this.currentThickness,
        strokeUniform: true,
        selectable: false,
        evented: false
      });
      this.canvas.add(this.drawingObject);
    } catch (error) {
      console.error('Ellipse drawing error:', error);
    }
  }

  updateDrawingEllipse(pointer) {
    if (!this.drawingObject || !this.startPoint) {
      return;
    }

    try {
      const width = pointer.x - this.startPoint.x;
      const height = pointer.y - this.startPoint.y;
      const rx = Math.abs(width) / 2;
      const ry = Math.abs(height) / 2;

      if (this.isGradient) {
        if (this.drawingObject.stroke && typeof this.drawingObject.stroke === 'object') {
          this.drawingObject.set('stroke', this.createGradient({ width: Math.max(rx * 2, 100) }));
        }
        if (this.drawingObject.fill && typeof this.drawingObject.fill === 'object') {
          this.drawingObject.set('fill', this.createTextGradient({ width: Math.max(rx * 2, 100) }));
        }
      }

      this.drawingObject.set({
        left: width < 0 ? pointer.x : this.startPoint.x,
        top: height < 0 ? pointer.y : this.startPoint.y,
        rx: rx,
        ry: ry
      });
      this.canvas.renderAll();
    } catch (error) {
      console.error('Ellipse update error:', error);
    }
  }

  startDrawingArrow(pointer) {
    const arrowHeadSize = Math.max(15, this.currentThickness * 2.5);
    const pathString = this.createArrowPath(
      pointer.x,
      pointer.y,
      pointer.x,
      pointer.y,
      arrowHeadSize
    );

    const strokeStyle = this.isGradient ? this.createGradient({ width: 200 }) : this.currentColor;

    this.drawingObject = new fabric.Path(pathString, {
      fill: '',
      stroke: strokeStyle,
      strokeWidth: this.currentThickness,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      selectable: false,
      evented: false,
      shadow: {
        color: 'rgba(0,0,0,0.3)',
        blur: 3,
        offsetX: 1,
        offsetY: 1
      },
      arrowStart: { x: pointer.x, y: pointer.y },
      arrowEnd: { x: pointer.x, y: pointer.y }
    });

    this.canvas.add(this.drawingObject);
    this.canvas.renderAll();
  }

  updateDrawingArrow(pointer) {
    if (!this.drawingObject || !this.startPoint) {
      return;
    }

    try {
      const deltaX = pointer.x - this.startPoint.x;
      const deltaY = pointer.y - this.startPoint.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance < 5) {
        return;
      }

      const arrowHeadSize = Math.max(15, this.currentThickness * 2.5);
      const pathString = this.createArrowPath(
        this.startPoint.x,
        this.startPoint.y,
        pointer.x,
        pointer.y,
        arrowHeadSize
      );

      this.canvas.remove(this.drawingObject);

      const arrowLength = Math.sqrt(
        Math.pow(pointer.x - this.startPoint.x, 2) +
        Math.pow(pointer.y - this.startPoint.y, 2)
      );
      const strokeStyle = this.isGradient ? this.createGradient({ width: Math.max(arrowLength, 100) }) : this.currentColor;

      this.drawingObject = new fabric.Path(pathString, {
        fill: '',
        stroke: strokeStyle,
        strokeWidth: this.currentThickness,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        selectable: false,
        evented: false,
        shadow: {
          color: 'rgba(0,0,0,0.3)',
          blur: 3,
          offsetX: 1,
          offsetY: 1
        },
        arrowStart: { x: this.startPoint.x, y: this.startPoint.y },
        arrowEnd: { x: pointer.x, y: pointer.y }
      });

      this.canvas.add(this.drawingObject);
      this.canvas.renderAll();
    } catch (error) {
      console.error('Arrow update error:', error);
    }
  }

  createArrowPath(x1, y1, x2, y2, headSize) {
    const angle = Math.atan2(y2 - y1, x2 - x1);

    const arrowAngle = Math.PI / 6;

    const headLength = headSize;

    const x3 = x2 - headLength * Math.cos(angle - arrowAngle);
    const y3 = y2 - headLength * Math.sin(angle - arrowAngle);

    const x4 = x2 - headLength * Math.cos(angle + arrowAngle);
    const y4 = y2 - headLength * Math.sin(angle + arrowAngle);

    const pathString = `M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} M ${x2} ${y2} L ${x4} ${y4}`;

    return pathString;
  }

  finishArrow() {
    if (!this.drawingObject || !this.startPoint) {
      return;
    }

    try {
      this.drawingObject.set({
        selectable: true,
        evented: true,
        hasControls: true,
        hasBorders: true,
        lockRotation: false,
        lockScalingX: false,
        lockScalingY: false,
        lockUniScaling: false
      });

      this.canvas.setActiveObject(this.drawingObject);
      this.canvas.renderAll();

      this.drawingObject = null;
      this.saveState();

      this.setTool('select');
    } catch (error) {
      console.error('Arrow finish error:', error);
    }
  }

  startDrawingMosaic(pointer) {
    this.drawingObject = new fabric.Rect({
      left: pointer.x,
      top: pointer.y,
      width: 0,
      height: 0,
      fill: 'rgba(200, 200, 200, 0.3)',
      stroke: '#666',
      strokeWidth: 2,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false
    });
    this.canvas.add(this.drawingObject);
  }

  updateDrawingMosaic(pointer) {
    if (!this.drawingObject || !this.startPoint) return;

    const width = pointer.x - this.startPoint.x;
    const height = pointer.y - this.startPoint.y;

    this.drawingObject.set({
      left: width < 0 ? pointer.x : this.startPoint.x,
      top: height < 0 ? pointer.y : this.startPoint.y,
      width: Math.abs(width),
      height: Math.abs(height)
    });
    this.canvas.renderAll();
  }

  async applyMosaic() {
    if (!this.drawingObject) return;

    const rect = this.drawingObject;
    const left = Math.max(0, Math.round(rect.left));
    const top = Math.max(0, Math.round(rect.top));
    const width = Math.min(Math.round(rect.width), this.canvas.width - left);
    const height = Math.min(Math.round(rect.height), this.canvas.height - top);

    if (width < 10 || height < 10) {
      this.canvas.remove(rect);
      this.drawingObject = null;
      return;
    }

    this.canvas.remove(rect);

    const dataURL = this.canvas.toDataURL({ format: 'png' });

    const img = new Image();
    img.onload = () => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');

      // 元画像データを保存（強度変更用）
      tempCtx.drawImage(img, left, top, width, height, 0, 0, width, height);
      const originalDataURL = tempCanvas.toDataURL();

      const imageData = tempCtx.getImageData(0, 0, width, height);
      const mosaicData = this.createMosaicEffect(imageData, this.mosaicIntensity);
      tempCtx.putImageData(mosaicData, 0, 0);

      const mosaicDataURL = tempCanvas.toDataURL();
      fabric.Image.fromURL(mosaicDataURL, (mosaicImg) => {
        mosaicImg.set({
          left: left,
          top: top,
          selectable: true,
          evented: true,
          hasControls: true,
          hasBorders: true,
          lockRotation: false,
          lockScalingX: false,
          lockScalingY: false,
          lockUniScaling: false,
          isMosaic: true,
          mosaicOriginalDataURL: originalDataURL,
          mosaicOriginalWidth: width,
          mosaicOriginalHeight: height,
          mosaicIntensity: this.mosaicIntensity
        });

        this.canvas.add(mosaicImg);
        this.setTool('select');
        this.canvas.setActiveObject(mosaicImg);
        this.canvas.renderAll();
        this.drawingObject = null;
        this.saveState();
      });
    };
    img.src = dataURL;
  }

  // モザイクオブジェクトの強度を再生成する
  reapplyMosaicIntensity(mosaicObj, newIntensity) {
    if (!mosaicObj || !mosaicObj.mosaicOriginalDataURL) return;

    const origWidth = mosaicObj.mosaicOriginalWidth;
    const origHeight = mosaicObj.mosaicOriginalHeight;
    const origLeft = mosaicObj.left;
    const origTop = mosaicObj.top;
    const origScaleX = mosaicObj.scaleX;
    const origScaleY = mosaicObj.scaleY;
    const origAngle = mosaicObj.angle;

    const origImg = new Image();
    origImg.onload = () => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = origWidth;
      tempCanvas.height = origHeight;
      const tempCtx = tempCanvas.getContext('2d');

      tempCtx.drawImage(origImg, 0, 0);
      const imageData = tempCtx.getImageData(0, 0, origWidth, origHeight);
      const mosaicData = this.createMosaicEffect(imageData, newIntensity);
      tempCtx.putImageData(mosaicData, 0, 0);

      const newDataURL = tempCanvas.toDataURL();
      fabric.Image.fromURL(newDataURL, (newMosaicImg) => {
        newMosaicImg.set({
          left: origLeft,
          top: origTop,
          scaleX: origScaleX,
          scaleY: origScaleY,
          angle: origAngle,
          selectable: true,
          evented: true,
          hasControls: true,
          hasBorders: true,
          lockRotation: false,
          lockScalingX: false,
          lockScalingY: false,
          lockUniScaling: false,
          isMosaic: true,
          mosaicOriginalDataURL: mosaicObj.mosaicOriginalDataURL,
          mosaicOriginalWidth: origWidth,
          mosaicOriginalHeight: origHeight,
          mosaicIntensity: newIntensity
        });

        // 元のオブジェクトと同じレイヤー位置に揿入
        const objects = this.canvas.getObjects();
        const index = objects.indexOf(mosaicObj);
        this.canvas.remove(mosaicObj);
        if (index >= 0 && index < this.canvas.getObjects().length) {
          this.canvas.insertAt(newMosaicImg, index);
        } else {
          this.canvas.add(newMosaicImg);
        }
        this.canvas.setActiveObject(newMosaicImg);
        this.canvas.renderAll();
        this.saveState();
      });
    };
    origImg.src = mosaicObj.mosaicOriginalDataURL;
  }

  createMosaicEffect(imageData, blockSize) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    for (let y = 0; y < height; y += blockSize) {
      for (let x = 0; x < width; x += blockSize) {
        let r = 0, g = 0, b = 0, count = 0;

        for (let by = 0; by < blockSize && y + by < height; by++) {
          for (let bx = 0; bx < blockSize && x + bx < width; bx++) {
            const i = ((y + by) * width + (x + bx)) * 4;
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
          }
        }

        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);

        for (let by = 0; by < blockSize && y + by < height; by++) {
          for (let bx = 0; bx < blockSize && x + bx < width; bx++) {
            const i = ((y + by) * width + (x + bx)) * 4;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
          }
        }
      }
    }

    return imageData;
  }

  createTextObject(x, y) {
    const fillStyle = this.isGradient ? this.createTextGradient() : this.currentColor;

    const textObject = new fabric.IText('', {
      left: x,
      top: y,
      fill: fillStyle,
      fontSize: this.currentFontSize,
      fontFamily: 'Noto Sans JP',
      fontWeight: 'bold',
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
      lockRotation: false,
      lockScalingX: false,
      lockScalingY: false,
      lockUniScaling: false,
      textBaseline: 'alphabetic'
    });

    this.setTool('select');

    this.canvas.add(textObject);
    this.canvas.setActiveObject(textObject);

    if (!textObject.__editingExitedHandlerAttached) {
      textObject.on('editing:exited', () => {
        if (this.editingTextObject === textObject) {
          this.isTextEditing = false;
          this.editingTextObject = null;
        }
      });
      textObject.__editingExitedHandlerAttached = true;
    }

    textObject.enterEditing();
    this.isTextEditing = true;
    this.editingTextObject = textObject;
    this.canvas.renderAll();
    this.saveState();
  }

  editTextObject(textObject, evt = null) {
    this.isTextEditing = true;
    this.editingTextObject = textObject;

    if (textObject.fontFamily !== 'Noto Sans JP') {
      textObject.set({
        fontFamily: 'Noto Sans JP',
        fontWeight: 'bold',
        stroke: null,
        strokeWidth: 0,
        textBaseline: 'alphabetic'
      });
    }

    if (!textObject.__editingExitedHandlerAttached) {
      textObject.on('editing:exited', () => {
        if (this.editingTextObject === textObject) {
          this.isTextEditing = false;
          this.editingTextObject = null;
        }
      });
      textObject.__editingExitedHandlerAttached = true;
    }

    if (!textObject.isEditing) {
      textObject.enterEditing();
    }

    // クリック位置にカーソルを置く（取得できなければ末尾）
    const textLen = textObject.text ? textObject.text.length : 0;
    let caret = textLen;
    if (evt && typeof textObject.getSelectionStartFromPointer === 'function') {
      try {
        caret = textObject.getSelectionStartFromPointer(evt);
      } catch (e) {
        caret = textLen;
      }
    }

    // 日本語などスペース区切りが無いテキストでは、ダブルクリックで全文が
    // 単語選択され、次の入力で全消えしてしまう。選択を解除しカーソルのみ置く。
    const collapseSelection = () => {
      textObject.selectionStart = caret;
      textObject.selectionEnd = caret;
      if (textObject.hiddenTextarea) {
        textObject.hiddenTextarea.selectionStart = caret;
        textObject.hiddenTextarea.selectionEnd = caret;
      }
      if (typeof textObject.setSelectionStart === 'function') {
        textObject.setSelectionStart(caret);
        textObject.setSelectionEnd(caret);
      }
      this.canvas.renderAll();
    };

    collapseSelection();
    // fabric標準のダブルクリック単語選択が後から走るケースに備え、
    // 次のイベントサイクルでも選択を解除しておく
    setTimeout(collapseSelection, 0);

    this.canvas.renderAll();
  }

  isInTextEditingMode() {
    const ao = this.canvas.getActiveObject();
    return !!(ao && ao.type === 'i-text' && ao.isEditing === true);
  }

  finishTextEditing() {
    if (this.isTextEditing && this.editingTextObject) {
      this.editingTextObject.exitEditing();
      this.isTextEditing = false;
      this.editingTextObject = null;
      this.canvas.renderAll();
      this.saveState();
    }
  }

  async onPaste(e) {
    if (!this.canvas) {
      console.error('Canvasが初期化されていません');
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const clipboardItems = await navigator.clipboard.read();

        for (const clipboardItem of clipboardItems) {
          for (const type of clipboardItem.types) {
            if (type.startsWith('image/')) {
              e.preventDefault();
              const blob = await clipboardItem.getType(type);
              await this.addImageFromBlob(blob);
              return;
            }
          }
        }
      }

      if (e.clipboardData && e.clipboardData.items) {
        const items = e.clipboardData.items;

        for (let i = 0; i < items.length; i++) {
          const item = items[i];

          if (item.type.indexOf('image') !== -1) {
            e.preventDefault();
            const blob = item.getAsFile();
            await this.addImageFromBlob(blob);
            break;
          }
        }
      }
    } catch (error) {
      console.error('クリップボード貼り付けエラー:', error);
    }
  }

  handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
      if (file.type.startsWith('video/')) {
        this.addVideoFromBlob(file);
      } else if (file.type.startsWith('image/')) {
        this.addImageFromBlob(file);
      }
      e.target.value = '';
    }
  }

  async onDrop(e) {
    if (!this.canvas) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('video/')) {
          await this.addVideoFromBlob(file);
        } else if (file.type.startsWith('image/')) {
          await this.addImageFromBlob(file);
        }
      }
    }
  }

  async addVideoFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(blob);
      video.crossOrigin = 'anonymous';
      video.loop = true;
      video.muted = false;
      video.playsInline = true;

      video.style.position = 'absolute';
      video.style.top = '-9999px';
      video.style.left = '-9999px';
      video.style.opacity = '0';
      video.style.pointerEvents = 'none';
      document.body.appendChild(video);

      video.onloadeddata = async () => {
        try {
          if (video.videoWidth === 0 || video.videoHeight === 0) {
            throw new Error('Video dimensions not available');
          }

          video.width = video.videoWidth;
          video.height = video.videoHeight;

          await video.play();
          video.pause();
          video.currentTime = 0;

          const videoObj = new fabric.Image(video, {
            left: this.canvas.width / 2,
            top: this.canvas.height / 2,
            originX: 'center',
            originY: 'center',
            objectCaching: false,
            selectable: true,
            evented: true,
            isVideo: true
          });

          if (video.videoWidth > this.canvas.width * 0.8 || video.videoHeight > this.canvas.height * 0.8) {
            const scale = Math.min(
              (this.canvas.width * 0.8) / video.videoWidth,
              (this.canvas.height * 0.8) / video.videoHeight
            );
            videoObj.scale(scale);
          }

          this.canvas.add(videoObj);
          this.canvas.setActiveObject(videoObj);
          this.canvas.renderAll();
          this.saveState();

          this.showToast('動画を追加しました');

          video.onloadeddata = null;
          resolve();
        } catch (e) {
          if (video.parentNode) video.parentNode.removeChild(video);
          this.showToast('動画の処理に失敗しました', 'error');
          reject(e);
        }
      };

      video.onerror = (e) => {
        if (video.parentNode) video.parentNode.removeChild(video);
        this.showToast('動画の読み込みに失敗しました', 'error');
        reject(e);
      };
    });
  }

  getSelectedVideo() {
    const activeObject = this.canvas.getActiveObject();
    if (activeObject && typeof activeObject.getElement === 'function') {
      try {
        const el = activeObject.getElement();
        if (el && el.tagName === 'VIDEO') {
          return el;
        }
      } catch (e) {
      }
    }
    return null;
  }

  updateVideoControlsVisibility() {
    const video = this.getSelectedVideo();
    if (video) {
      this.showVideoControls();
      this.updateVideoControlsUI(video);
    } else {
      this.hideVideoControls();
    }
  }

  showVideoControls() {
    const videoControls = document.getElementById('videoControls');
    if (videoControls) {
      videoControls.style.display = 'block';
    }
  }

  hideVideoControls() {
    const videoControls = document.getElementById('videoControls');
    if (videoControls) {
      videoControls.style.display = 'none';
    }
  }

  // [SVG対応] 動画コントロールUIの更新（SVGアイコンの表示切替）
  updateVideoControlsUI(video) {
    const playPauseBtn = document.getElementById('videoPlayPauseBtn');
    const muteBtn = document.getElementById('videoMuteBtn');
    const loopBtn = document.getElementById('videoLoopBtn');

    if (playPauseBtn) {
      const isPaused = video.paused;
      const playIcon = playPauseBtn.querySelector('.play-icon');
      const pauseIcon = playPauseBtn.querySelector('.pause-icon');
      if (playIcon && pauseIcon) {
        playIcon.style.display = isPaused ? '' : 'none';
        pauseIcon.style.display = isPaused ? 'none' : '';
      }
      const textEl = playPauseBtn.querySelector('.video-text');
      if (textEl) textEl.textContent = isPaused ? '再生' : '停止';
    }

    if (muteBtn) {
      const isMuted = video.muted;
      const muteOffIcon = muteBtn.querySelector('.mute-off-icon');
      const muteOnIcon = muteBtn.querySelector('.mute-on-icon');
      if (muteOffIcon && muteOnIcon) {
        muteOffIcon.style.display = isMuted ? 'none' : '';
        muteOnIcon.style.display = isMuted ? '' : 'none';
      }
      const textEl = muteBtn.querySelector('.video-text');
      if (textEl) textEl.textContent = isMuted ? '音声OFF' : '音声ON';
    }

    if (loopBtn) {
      const isLoop = video.loop;
      loopBtn.classList.toggle('active', isLoop);
      const textEl = loopBtn.querySelector('.video-text');
      if (textEl) textEl.textContent = isLoop ? 'ループON' : 'ループOFF';
    }

    this.updateTimeDisplay(video);
  }

  toggleVideoPlayPause() {
    const video = this.getSelectedVideo();
    if (video) {
      if (video.paused) {
        video.play();
        this.startVideoRenderLoop();
      } else {
        video.pause();
      }
      this.updateVideoControlsUI(video);
      this.canvas.renderAll();
    }
  }

  toggleVideoMute() {
    const video = this.getSelectedVideo();
    if (video) {
      video.muted = !video.muted;
      this.updateVideoControlsUI(video);
    }
  }

  toggleVideoLoop() {
    const video = this.getSelectedVideo();
    if (video) {
      video.loop = !video.loop;
      this.updateVideoControlsUI(video);
    }
  }

  onSeekBarInput(e) {
    const video = this.getSelectedVideo();
    if (video && video.duration) {
      const seekTime = (e.target.value / 100) * video.duration;
      video.currentTime = seekTime;
      this.updateTimeDisplay(video);
    }
  }

  onSeekBarChange(e) {
    const video = this.getSelectedVideo();
    if (video && video.duration) {
      const seekTime = (e.target.value / 100) * video.duration;
      video.currentTime = seekTime;
      this.updateTimeDisplay(video);
    }
    this.isSeeking = false;
  }

  updateTimeDisplay(video) {
    const currentTimeEl = document.getElementById('videoCurrentTime');
    const durationEl = document.getElementById('videoDuration');
    const seekBar = document.getElementById('videoSeekBar');

    if (currentTimeEl && video) {
      currentTimeEl.textContent = this.formatTime(video.currentTime);
    }
    if (durationEl && video) {
      durationEl.textContent = this.formatTime(video.duration || 0);
    }
    if (seekBar && video && video.duration && !this.isSeeking) {
      seekBar.value = (video.currentTime / video.duration) * 100;
    }
  }

  formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  startVideoRenderLoop() {
    if (this.isVideoLoopRunning) return;

    this.isVideoLoopRunning = true;
    const renderLoop = () => {
      const hasVideo = this.canvas.getObjects().some(obj => {
        if (typeof obj.getElement !== 'function') return false;
        try {
          const el = obj.getElement();
          return el && el.tagName === 'VIDEO';
        } catch (e) {
          return false;
        }
      });

      if (hasVideo) {
        this.canvas.requestRenderAll();

        const video = this.getSelectedVideo();
        if (video) {
          this.updateTimeDisplay(video);
        }

        fabric.util.requestAnimFrame(renderLoop);
      } else {
        this.isVideoLoopRunning = false;
      }
    };

    fabric.util.requestAnimFrame(renderLoop);
  }

  async addImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        fabric.Image.fromURL(event.target.result, (img) => {
          try {
            const canvasWidth = this.canvas.width;
            const canvasHeight = this.canvas.height;

            let scale = 1;
            if (img.width > canvasWidth * 0.9 || img.height > canvasHeight * 0.9) {
              const scaleX = (canvasWidth * 0.9) / img.width;
              const scaleY = (canvasHeight * 0.9) / img.height;
              scale = Math.min(scaleX, scaleY);
            }

            img.scale(scale);

            img.set({
              left: canvasWidth / 2,
              top: canvasHeight / 2,
              originX: 'center',
              originY: 'center',
              selectable: true,
              evented: true,
              objectCaching: false,
              imageSmoothing: true
            });

            const isFirstObject = this.canvas.getObjects().length === 0;
            this.canvas.add(img);
            if (isFirstObject) {
              this.canvas.sendToBack(img);
            } else {
              this.canvas.setActiveObject(img);
            }
            this.canvas.renderAll();
            this.saveState();

            this.showToast('画像を貼り付けました');
            resolve();
          } catch (error) {
            console.error('画像追加エラー:', error);
            reject(error);
          }
        });
      };

      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(blob);
    });
  }

  updateSelectedObjectColor(targets = null) {
    const snapshot = Array.isArray(targets) && targets.length
      ? targets.filter(obj => obj && obj.canvas === this.canvas)
      : null;
    const activeObjects = snapshot && snapshot.length
      ? snapshot
      : this.canvas.getActiveObjects();
    const activeObject = activeObjects[0] || this.canvas.getActiveObject();

    const strokeStyle = this.isGradient ? this.createGradient({ width: 200 }) : this.currentColor;
    const fillStyle = this.isGradient ? this.createTextGradient({ width: 200 }) : this.currentColor;

    const applyITextFill = (obj, fill) => {
      if (typeof obj.removeStyle === 'function') {
        obj.removeStyle('fill');
      }
      obj.set({
        fill,
        fontFamily: 'Noto Sans JP',
        fontWeight: 'bold',
        textBaseline: 'alphabetic'
      });
      obj.dirty = true;
    };

    const applyStepMarkerFill = (group, fill) => {
      const circle = group.getObjects().find(o => o.type === 'circle');
      if (circle) circle.set('fill', fill);
      group.dirty = true;
    };

    // 塗りつぶし済みの図形（四角形・円）かどうか
    const isFilledShape = (obj) =>
      (obj.type === 'rect' || obj.type === 'ellipse') &&
      obj.fill && obj.fill !== 'transparent';

    const applyColorToObject = (obj) => {
      if (obj.type === 'i-text') {
        applyITextFill(obj, fillStyle);
      } else if (obj.isStepMarker) {
        applyStepMarkerFill(obj, fillStyle);
      } else if (obj.type === 'path') {
        obj.set({ fill: '', stroke: strokeStyle });
      } else if (isFilledShape(obj)) {
        // 塗りつぶし図形は塗りの色を変更
        obj.set('fill', fillStyle);
      } else {
        obj.set('stroke', strokeStyle);
      }
    };

    if (activeObjects && activeObjects.length > 1) {
      activeObjects.forEach(applyColorToObject);
      this.canvas.renderAll();
      this.saveState();
    }
    else if (activeObject) {
      applyColorToObject(activeObject);
      this.canvas.renderAll();
      this.saveState();
    }
  }

  // 塗りつぶしトグルの変更を選択中の図形（四角形・円）に反映
  updateSelectedObjectFill() {
    const activeObjects = this.canvas.getActiveObjects();
    const targets = (activeObjects && activeObjects.length)
      ? activeObjects
      : (this.canvas.getActiveObject() ? [this.canvas.getActiveObject()] : []);

    if (!targets.length) return;

    let changed = false;
    targets.forEach(obj => {
      if (obj.type !== 'rect' && obj.type !== 'ellipse') return;

      const shapeWidth = obj.width || 200;
      if (this.isFillEnabled) {
        obj.set({
          fill: this.getShapeFillStyle(shapeWidth),
          stroke: 'transparent',
          strokeWidth: 0
        });
      } else {
        obj.set({
          fill: 'transparent',
          stroke: this.getShapeStrokeStyle(shapeWidth),
          strokeWidth: this.currentThickness
        });
      }
      changed = true;
    });

    if (changed) {
      this.canvas.renderAll();
      this.saveState();
    }
  }

  // 角丸トグルの変更を選択中の四角形に反映
  updateSelectedObjectCorner() {
    const activeObjects = this.canvas.getActiveObjects();
    const targets = (activeObjects && activeObjects.length)
      ? activeObjects
      : (this.canvas.getActiveObject() ? [this.canvas.getActiveObject()] : []);

    if (!targets.length) return;

    let changed = false;
    targets.forEach(obj => {
      if (obj.type !== 'rect') return;
      obj.set({ rx: this.rectCornerRadius, ry: this.rectCornerRadius });
      obj.dirty = true;
      changed = true;
    });

    if (changed) {
      this.canvas.renderAll();
      this.saveState();
    }
  }

  // 選択オブジェクト（テキストボックス・図形など）を複製する
  duplicateSelected() {
    const active = this.canvas.getActiveObject();
    if (!active) return;

    const OFFSET = 20;

    active.clone((cloned) => {
      this.canvas.discardActiveObject();

      if (cloned.type === 'activeSelection') {
        // 複数選択の複製
        cloned.canvas = this.canvas;
        cloned.set({ left: cloned.left + OFFSET, top: cloned.top + OFFSET });
        cloned.forEachObject((obj) => {
          obj.selectable = true;
          obj.evented = true;
          this.canvas.add(obj);
        });
        cloned.setCoords();
      } else {
        cloned.set({
          left: cloned.left + OFFSET,
          top: cloned.top + OFFSET,
          selectable: true,
          evented: true
        });
        this.canvas.add(cloned);
      }

      // テキスト編集を確実に抜けた状態にする
      if (cloned.type === 'i-text') {
        cloned.isEditing = false;
      }

      this.canvas.setActiveObject(cloned);
      this.canvas.requestRenderAll();
      this.saveState();
      this.showToast('複製しました');
    }, ['selectable', 'evented', 'arrowStart', 'arrowEnd', 'isMosaic', 'isVideo', 'isMarker', 'isStepMarker',
        'mosaicOriginalDataURL', 'mosaicOriginalWidth', 'mosaicOriginalHeight', 'mosaicIntensity']);
  }

  // ブランドロゴ: icons/logo.png があれば画像、無ければテキスト表示
  setupBrandLogo() {
    const logoImg = document.getElementById('brandLogoImg');
    const logoText = document.getElementById('brandLogoText');
    if (!logoImg) return;

    const probe = new Image();
    probe.onload = () => {
      logoImg.src = 'icons/logo.png';
      logoImg.style.display = 'block';
      if (logoText) logoText.style.display = 'none';
    };
    probe.onerror = () => {
      // ロゴ画像が無い場合はテキストワードマークのまま
      logoImg.style.display = 'none';
      if (logoText) logoText.style.display = 'block';
    };
    probe.src = 'icons/logo.png';
  }

  updateSelectedObjectFontSize() {
    const activeObject = this.canvas.getActiveObject();
    const activeObjects = this.canvas.getActiveObjects();

    const applyITextFontSize = (obj, fontSize) => {
      if (typeof obj.removeStyle === 'function') {
        obj.removeStyle('fontSize');
      }
      obj.set({
        fontSize,
        fontFamily: 'Noto Sans JP',
        fontWeight: 'bold',
        textBaseline: 'alphabetic'
      });
      obj.dirty = true;
    };

    if (activeObjects && activeObjects.length > 1) {
      activeObjects.forEach(obj => {
        if (obj.type === 'i-text') {
          applyITextFontSize(obj, this.currentFontSize);
        }
      });
      this.canvas.renderAll();
      this.saveState();
    }
    else if (activeObject && activeObject.type === 'i-text') {
      applyITextFontSize(activeObject, this.currentFontSize);
      this.canvas.renderAll();
      this.saveState();
    }
  }

  updateSelectedObjectThickness() {
    const activeObject = this.canvas.getActiveObject();
    const activeObjects = this.canvas.getActiveObjects();

    if (activeObject && activeObject.type === 'i-text') {
      return;
    }

    if (activeObjects && activeObjects.length > 1) {
      activeObjects.forEach(obj => {
        if (obj.type === 'path' && obj.arrowStart && obj.arrowEnd) {
          this.updateArrowThickness(obj);
        } else if (obj.strokeWidth !== undefined && obj.type !== 'i-text') {
          obj.set('strokeWidth', this.currentThickness);
        }
      });
      this.canvas.renderAll();
      this.saveState();
    }
    else if (activeObject) {
      if (activeObject.type === 'path' && activeObject.arrowStart && activeObject.arrowEnd) {
        this.updateArrowThickness(activeObject);
      } else if (activeObject.strokeWidth !== undefined && activeObject.type !== 'i-text') {
        activeObject.set('strokeWidth', this.currentThickness);
      }
      this.canvas.renderAll();
      this.saveState();
    }
  }

  updateArrowThickness(arrowObject) {
    const arrowHeadSize = Math.max(15, this.currentThickness * 2.5);
    const pathString = this.createArrowPath(
      arrowObject.arrowStart.x,
      arrowObject.arrowStart.y,
      arrowObject.arrowEnd.x,
      arrowObject.arrowEnd.y,
      arrowHeadSize
    );

    this.canvas.remove(arrowObject);

    const isGradient = arrowObject.stroke && typeof arrowObject.stroke === 'object';
    const strokeStyle = isGradient ? this.createGradient({ width: 200 }) : this.currentColor;

    const newArrow = new fabric.Path(pathString, {
      fill: '',
      stroke: strokeStyle,
      strokeWidth: this.currentThickness,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
      lockRotation: false,
      lockScalingX: false,
      lockScalingY: false,
      lockUniScaling: false,
      shadow: {
        color: 'rgba(0,0,0,0.3)',
        blur: 3,
        offsetX: 1,
        offsetY: 1
      },
      arrowStart: arrowObject.arrowStart,
      arrowEnd: arrowObject.arrowEnd
    });

    this.canvas.add(newArrow);
    this.canvas.setActiveObject(newArrow);
  }

  showContextMenu(x, y) {
    const menu = document.getElementById('contextMenu');
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.classList.remove('hidden');
  }

  hideContextMenu() {
    document.getElementById('contextMenu').classList.add('hidden');
  }

  deleteSelected() {
    const activeObject = this.canvas.getActiveObject();
    const activeObjects = this.canvas.getActiveObjects();

    if (activeObjects && activeObjects.length > 1) {
      activeObjects.forEach(obj => {
        this.canvas.remove(obj);
      });
      this.canvas.discardActiveObject();
      this.canvas.renderAll();
      this.saveState();
    }
    else if (activeObject) {
      this.canvas.remove(activeObject);
      this.canvas.renderAll();
      this.saveState();
    }
  }

  setupRotationSnap() {
    fabric.Object.prototype.controls.mtr = new fabric.Control({
      x: 0,
      y: -0.5,
      offsetY: -10,
      actionHandler: fabric.controlsUtils.rotationWithSnapping,
      actionName: 'rotate',
      cursorStyle: 'crosshair'
    });
  }

  applyRotationSnap(object) {
    const snapAngles = [0, 90, 180, 270];
    const snapThreshold = 2;

    let currentAngle = object.angle;

    while (currentAngle < 0) currentAngle += 360;
    while (currentAngle >= 360) currentAngle -= 360;

    for (const snapAngle of snapAngles) {
      const diff = Math.abs(currentAngle - snapAngle);
      if (diff <= snapThreshold || diff >= (360 - snapThreshold)) {
        object.set('angle', snapAngle);
        this.canvas.renderAll();
        break;
      }
    }
  }

  // [改善2] Undo/Redo最適化: 背景画像を除外してJSON保存
  saveState() {
    if (this.isLoadingState) return;

    this.history = this.history.slice(0, this.historyStep + 1);

    // カスタムプロパティを含めてJSON化
    const json = JSON.stringify(this.canvas.toJSON(['selectable', 'evented', 'arrowStart', 'arrowEnd', 'isMosaic', 'isVideo', 'isMarker', 'isStepMarker']));
    this.history.push(json);
    this.historyStep++;

    if (this.history.length > 20) {
      this.history.shift();
      this.historyStep--;
    }
  }

  undo() {
    if (this.historyStep > 0) {
      this.historyStep--;
      this.restoreState(this.history[this.historyStep]);
    }
  }

  redo() {
    if (this.historyStep < this.history.length - 1) {
      this.historyStep++;
      this.restoreState(this.history[this.historyStep]);
    }
  }

  restoreState(stateJson) {
    this.isLoadingState = true;
    this.canvas.loadFromJSON(stateJson, () => {
      this.canvas.forEachObject(obj => {
        if (obj.type === 'i-text' || obj.type === 'text') {
          if (obj.textBaseline === 'alphabetical' || !obj.textBaseline) {
            obj.set('textBaseline', 'alphabetic');
          }
        }
      });

      this.canvas.renderAll();
      this.isLoadingState = false;

      if (this.currentTool !== 'select') {
        this.canvas.forEachObject(obj => {
          obj.selectable = false;
          obj.evented = false;
        });
      }
    });
  }

  async saveColorSettings() {
    try {
      const cropToggle = document.getElementById('cropToggle');
      const canvasSizeSelect = document.getElementById('canvasSizeSelect');
      await chrome.storage.local.set({
        colorSettings: {
          currentColor: this.currentColor,
          currentThickness: this.currentThickness,
          currentFontSize: this.currentFontSize,
          mosaicIntensity: this.mosaicIntensity,
          isGradient: this.isGradient,
          isFillEnabled: this.isFillEnabled,
          rectCornerRadius: this.rectCornerRadius,
          isMarkerStraight: this.isMarkerStraight,
          gradientStartColor: this.gradientStartColor,
          gradientEndColor: this.gradientEndColor,
          cropToggleOn: cropToggle ? cropToggle.checked : false,
          canvasSize: canvasSizeSelect ? canvasSizeSelect.value : 'free'
        }
      });
    } catch (error) {
      console.error('色設定保存エラー:', error);
    }
  }

  async loadColorSettings() {
    try {
      const result = await chrome.storage.local.get('colorSettings');
      if (result.colorSettings) {
        this.currentColor = result.colorSettings.currentColor || '#FF0000';
        this.currentThickness = result.colorSettings.currentThickness || 3;
        this.currentFontSize = result.colorSettings.currentFontSize || 24;
        if (typeof result.colorSettings.mosaicIntensity === 'number' &&
            this.mosaicIntensityOptions.includes(result.colorSettings.mosaicIntensity)) {
          this.mosaicIntensity = result.colorSettings.mosaicIntensity;
        }
        this.isGradient = result.colorSettings.isGradient || false;
        this.isFillEnabled = result.colorSettings.isFillEnabled || false;
        if (typeof result.colorSettings.rectCornerRadius === 'number') {
          this.rectCornerRadius = result.colorSettings.rectCornerRadius;
        }
        this.isMarkerStraight = result.colorSettings.isMarkerStraight || false;
        this.gradientStartColor = result.colorSettings.gradientStartColor || '#4285F4';
        this.gradientEndColor = result.colorSettings.gradientEndColor || '#ff52df';

        const fillToggle = document.getElementById('fillToggle');
        if (fillToggle) fillToggle.checked = this.isFillEnabled;

        const cornerToggle = document.getElementById('cornerToggle');
        if (cornerToggle) cornerToggle.checked = this.rectCornerRadius > 0;

        const markerStraightToggle = document.getElementById('markerStraightToggle');
        if (markerStraightToggle) markerStraightToggle.checked = this.isMarkerStraight;

        const startPicker = document.getElementById('gradientStartPicker');
        const endPicker = document.getElementById('gradientEndPicker');
        if (startPicker) startPicker.value = this.gradientStartColor;
        if (endPicker) endPicker.value = this.gradientEndColor;

        this.updateGradientButtonPreview();

        const colorPicker = document.getElementById('colorPicker');
        const thicknessPicker = document.getElementById('thicknessPicker');
        const thicknessValue = document.getElementById('thicknessValue');
        const fontSizeValue = document.getElementById('fontSizeValue');

        if (this.isGradient) {
          this.setGradient();
        } else {
          this.setColor(this.currentColor, false);
        }

        if (thicknessPicker) {
          thicknessPicker.value = this.currentThickness;
          this.updateThicknessSliderBackground(thicknessPicker);
        }
        if (thicknessValue) thicknessValue.textContent = this.currentThickness;
        if (fontSizeValue) fontSizeValue.textContent = this.currentFontSize;

        const fontSizeIndex = this.fontSizeOptions.indexOf(this.currentFontSize);
        if (fontSizeIndex !== -1) {
          const fontSizePicker = document.getElementById('fontSizePicker');
          if (fontSizePicker) {
            fontSizePicker.value = fontSizeIndex;
            this.updateFontSizeSliderBackground(fontSizePicker);
          }
        }

        // 範囲指定トグルの復元
        if (result.colorSettings.cropToggleOn !== undefined) {
          const cropToggle = document.getElementById('cropToggle');
          if (cropToggle) {
            cropToggle.checked = result.colorSettings.cropToggleOn;
          }
        }

        // キャンバスサイズの復元
        if (result.colorSettings.canvasSize) {
          const canvasSizeSelect = document.getElementById('canvasSizeSelect');
          if (canvasSizeSelect) {
            canvasSizeSelect.value = result.colorSettings.canvasSize;
            // キャンバスサイズを適用（初回はオブジェクトがないのでモーダル不要）
            this.previousCanvasSize = result.colorSettings.canvasSize;
            this.applyCanvasSize(result.colorSettings.canvasSize);
          }
        }
      }
    } catch (error) {
      console.error('色設定読み込みエラー:', error);
    }
  }

  async loadState() {
    try {
      this.saveState();
    } catch (error) {
      console.error('状態読み込みエラー:', error);
      this.saveState();
    }
  }

  showSaveDialog() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const autoFilename = `screenshot-${year}${month}${day}${hours}${minutes}${seconds}`;

    document.getElementById('filenameInput').value = autoFilename;
    document.getElementById('saveDialog').classList.remove('hidden');
    document.getElementById('filenameInput').focus();
    document.getElementById('filenameInput').select();
  }

  hideSaveDialog() {
    document.getElementById('saveDialog').classList.add('hidden');
  }

  saveImage() {
    const filename = document.getElementById('filenameInput').value || 'screenshot';

    this.canvas.discardActiveObject();
    this.canvas.renderAll();

    const dataURL = this.canvas.toDataURL({
      format: 'png',
      multiplier: 2,
      quality: 1
    });

    const link = document.createElement('a');
    link.href = dataURL;
    link.download = filename + '.png';
    link.click();

    this.hideSaveDialog();
  }

  // === 範囲指定トリミング機能 ===

  handleSave() {
    const cropToggle = document.getElementById('cropToggle');
    if (cropToggle && cropToggle.checked) {
      this.cropAction = 'save';
      this.showCropModal();
    } else {
      this.showSaveDialog();
    }
  }

  handleCopy() {
    const cropToggle = document.getElementById('cropToggle');
    if (cropToggle && cropToggle.checked) {
      this.cropAction = 'copy';
      this.showCropModal();
    } else {
      this.copyToClipboard();
    }
  }

  showCropModal() {
    this.canvas.discardActiveObject();
    this.canvas.renderAll();

    const modal = document.getElementById('cropModal');
    const previewCanvas = document.getElementById('cropPreviewCanvas');
    const container = document.querySelector('.crop-preview-container');

    // Fabric.jsの論理サイズ（CSS座標系）を基準とする
    // getWidth()/getHeight()は論理サイズ、getElement().width/heightは内部ピクセルサイズ
    const logicalW = this.canvas.getWidth();
    const logicalH = this.canvas.getHeight();
    const srcCanvas = this.canvas.getElement();
    const pixelW = srcCanvas.width;
    const pixelH = srcCanvas.height;

    // 論理サイズとピクセルサイズの比率（devicePixelRatioやRetina対応の影響）
    this.cropPixelRatio = pixelW / logicalW;

    // プレビューキャンバスのサイズを計算（論理サイズ基準でスケーリング）
    const maxW = Math.min(window.innerWidth * 0.7, 1200);
    const maxH = window.innerHeight * 0.55;
    const scale = Math.min(maxW / logicalW, maxH / logicalH, 1);
    const previewW = Math.floor(logicalW * scale);
    const previewH = Math.floor(logicalH * scale);

    // プレビューキャンバスには実際のピクセルデータから描画
    previewCanvas.width = previewW;
    previewCanvas.height = previewH;
    const ctx = previewCanvas.getContext('2d');
    ctx.drawImage(srcCanvas, 0, 0, pixelW, pixelH, 0, 0, previewW, previewH);

    // スケール率を保存（論理座標 → プレビュー座標の変換用）
    this.cropScale = scale;
    this.cropLogicalW = logicalW;
    this.cropLogicalH = logicalH;
    this.cropPreviewW = previewW;
    this.cropPreviewH = previewH;

    // モーダルを表示
    modal.classList.add('active');

    // オブジェクト範囲を自動検出して初期選択範囲を設定
    this.autoDetectCropBounds();

    // ドラッグイベントをセットアップ
    this.setupCropDragHandlers();
  }

  hideCropModal() {
    const modal = document.getElementById('cropModal');
    modal.classList.remove('active');
    this.cleanupCropDragHandlers();
  }

  autoDetectCropBounds() {
    const objects = this.canvas.getObjects();
    if (objects.length === 0) {
      // オブジェクトがない場合はキャンバス全体
      this.setCropSelection(0, 0, this.cropPreviewW, this.cropPreviewH);
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    // getBoundingRect()はFabric.jsの論理座標（CSS座標系）を返す
    objects.forEach(obj => {
      const bound = obj.getBoundingRect();
      minX = Math.min(minX, bound.left);
      minY = Math.min(minY, bound.top);
      maxX = Math.max(maxX, bound.left + bound.width);
      maxY = Math.max(maxY, bound.top + bound.height);
    });

    // 余白を追加（10px、論理座標系）
    const padding = 10;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(this.cropLogicalW, maxX + padding);
    maxY = Math.min(this.cropLogicalH, maxY + padding);

    // 論理座標 → プレビュー座標に変換（cropScale = プレビュー / 論理）
    const pMinX = Math.floor(minX * this.cropScale);
    const pMinY = Math.floor(minY * this.cropScale);
    const pMaxX = Math.floor(maxX * this.cropScale);
    const pMaxY = Math.floor(maxY * this.cropScale);

    this.setCropSelection(pMinX, pMinY, pMaxX - pMinX, pMaxY - pMinY);
  }

  setCropSelection(x, y, w, h) {
    const sel = document.getElementById('cropSelection');
    sel.style.left = x + 'px';
    sel.style.top = y + 'px';
    sel.style.width = w + 'px';
    sel.style.height = h + 'px';

    this.cropSelX = x;
    this.cropSelY = y;
    this.cropSelW = w;
    this.cropSelH = h;

    this.updateCropSizeInfo();
  }

  updateCropSizeInfo() {
    const info = document.getElementById('cropSizeInfo');
    // プレビュー座標 → 論理座標 → ピクセル座標（×2解像度出力）
    const logicalW = this.cropSelW / this.cropScale;
    const logicalH = this.cropSelH / this.cropScale;
    const realW = Math.round(logicalW * this.cropPixelRatio * 2);
    const realH = Math.round(logicalH * this.cropPixelRatio * 2);
    info.textContent = `${realW} x ${realH} px`;
  }

  resetCropToAuto() {
    this.autoDetectCropBounds();
  }

  setupCropDragHandlers() {
    const sel = document.getElementById('cropSelection');
    const container = document.querySelector('.crop-preview-container');

    this._cropDragState = null;

    const getPos = (e) => {
      const rect = container.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    this._cropMouseDown = (e) => {
      e.preventDefault();
      const pos = getPos(e);
      const handle = e.target.dataset ? e.target.dataset.handle : null;

      if (handle) {
        this._cropDragState = { type: 'resize', handle, startX: pos.x, startY: pos.y,
          origX: this.cropSelX, origY: this.cropSelY, origW: this.cropSelW, origH: this.cropSelH };
      } else if (e.target === sel || sel.contains(e.target)) {
        this._cropDragState = { type: 'move', startX: pos.x, startY: pos.y,
          origX: this.cropSelX, origY: this.cropSelY };
      }
    };

    this._cropMouseMove = (e) => {
      if (!this._cropDragState) return;
      e.preventDefault();
      const pos = getPos(e);
      const dx = pos.x - this._cropDragState.startX;
      const dy = pos.y - this._cropDragState.startY;
      const state = this._cropDragState;

      if (state.type === 'move') {
        let newX = Math.max(0, Math.min(this.cropPreviewW - this.cropSelW, state.origX + dx));
        let newY = Math.max(0, Math.min(this.cropPreviewH - this.cropSelH, state.origY + dy));
        this.setCropSelection(newX, newY, this.cropSelW, this.cropSelH);
      } else if (state.type === 'resize') {
        let x = state.origX, y = state.origY, w = state.origW, h = state.origH;
        const minSize = 20;

        const handleDir = state.handle;
        if (handleDir.includes('e')) {
          w = Math.max(minSize, Math.min(this.cropPreviewW - x, state.origW + dx));
        }
        if (handleDir.includes('w')) {
          const newX = Math.max(0, state.origX + dx);
          w = state.origW + (state.origX - newX);
          if (w >= minSize) { x = newX; } else { w = minSize; }
        }
        if (handleDir.includes('s')) {
          h = Math.max(minSize, Math.min(this.cropPreviewH - y, state.origH + dy));
        }
        if (handleDir.includes('n')) {
          const newY = Math.max(0, state.origY + dy);
          h = state.origH + (state.origY - newY);
          if (h >= minSize) { y = newY; } else { h = minSize; }
        }

        this.setCropSelection(x, y, w, h);
      }
    };

    this._cropMouseUp = () => {
      this._cropDragState = null;
    };

    sel.addEventListener('mousedown', this._cropMouseDown);
    sel.addEventListener('touchstart', this._cropMouseDown, { passive: false });
    document.addEventListener('mousemove', this._cropMouseMove);
    document.addEventListener('touchmove', this._cropMouseMove, { passive: false });
    document.addEventListener('mouseup', this._cropMouseUp);
    document.addEventListener('touchend', this._cropMouseUp);
  }

  cleanupCropDragHandlers() {
    const sel = document.getElementById('cropSelection');
    if (sel && this._cropMouseDown) {
      sel.removeEventListener('mousedown', this._cropMouseDown);
      sel.removeEventListener('touchstart', this._cropMouseDown);
    }
    if (this._cropMouseMove) {
      document.removeEventListener('mousemove', this._cropMouseMove);
      document.removeEventListener('touchmove', this._cropMouseMove);
    }
    if (this._cropMouseUp) {
      document.removeEventListener('mouseup', this._cropMouseUp);
      document.removeEventListener('touchend', this._cropMouseUp);
    }
  }

  getCropRegion() {
    // プレビュー座標 → 論理座標 → 内部ピクセル座標に変換
    const logicalX = this.cropSelX / this.cropScale;
    const logicalY = this.cropSelY / this.cropScale;
    const logicalW = this.cropSelW / this.cropScale;
    const logicalH = this.cropSelH / this.cropScale;
    // 内部ピクセル座標に変換（canvas.getElement().width/heightの座標系）
    const pr = this.cropPixelRatio;
    return {
      x: logicalX * pr,
      y: logicalY * pr,
      w: logicalW * pr,
      h: logicalH * pr
    };
  }

  executeCropSave() {
    const region = this.getCropRegion();
    const multiplier = 2;

    // 一時キャンバスで指定範囲を切り出し
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = Math.round(region.w * multiplier);
    tempCanvas.height = Math.round(region.h * multiplier);

    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    const srcCanvas = this.canvas.getElement();
    tempCtx.drawImage(
      srcCanvas,
      region.x, region.y, region.w, region.h,
      0, 0, tempCanvas.width, tempCanvas.height
    );

    const dataURL = tempCanvas.toDataURL('image/png');

    // ファイル名を自動生成
    const now = new Date();
    const filename = `screenshot-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;

    const link = document.createElement('a');
    link.href = dataURL;
    link.download = filename + '.png';
    link.click();

    this.hideCropModal();
    this.showToast('範囲指定で保存しました');
  }

  async executeCropCopy() {
    try {
      const region = this.getCropRegion();
      const multiplier = 2;

      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCanvas.width = Math.round(region.w * multiplier);
      tempCanvas.height = Math.round(region.h * multiplier);

      tempCtx.fillStyle = '#ffffff';
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      const srcCanvas = this.canvas.getElement();
      tempCtx.drawImage(
        srcCanvas,
        region.x, region.y, region.w, region.h,
        0, 0, tempCanvas.width, tempCanvas.height
      );

      const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);

      this.hideCropModal();
      this.showToast('範囲指定でクリップボードにコピーしました');
    } catch (error) {
      console.error('クリップボードコピーエラー:', error);
      this.showToast('クリップボードへのコピーに失敗しました', 'error');
    }
  }

  // [改善1] クリップボードコピーの高解像度化対応
  async copyToClipboard() {
    try {
      this.canvas.discardActiveObject();
      this.canvas.renderAll();

      const dataURL = this.canvas.toDataURL({
        format: 'png',
        multiplier: 2,  // ← 改善: 等倍 → 2倍解像度に変更
        quality: 1
      });

      const blob = await (await fetch(dataURL)).blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);

      this.showToast('クリップボードにコピーしました');
    } catch (error) {
      console.error('クリップボードコピーエラー:', error);
      this.showToast('クリップボードへのコピーに失敗しました', 'error');
    }
  }

  createTrimmedCanvas(x, y, width, height) {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    tempCanvas.width = width;
    tempCanvas.height = height;

    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, width, height);

    tempCtx.drawImage(
      this.canvas.getElement(),
      x, y, width, height,
      0, 0, width, height
    );

    return tempCanvas.toDataURL({
      format: 'png',
      quality: 1
    });
  }

  centerCanvas() {
    const container = document.getElementById('canvasContainer');
    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.alignItems = 'center';
  }

  setFontSize(size) {
    this.currentFontSize = size;
    document.getElementById('fontSizeValue').textContent = size;

    const fontSizeIndex = this.fontSizeOptions.indexOf(size);
    if (fontSizeIndex !== -1) {
      const fontSizePicker = document.getElementById('fontSizePicker');
      if (fontSizePicker) {
        fontSizePicker.value = fontSizeIndex;
        this.updateFontSizeSliderBackground(fontSizePicker);
      }
    }

    this.updateSelectedObjectFontSize();
    this.saveColorSettings();
  }

  updateFontSizeSliderBackground(slider) {
    const min = parseInt(slider.min);
    const max = parseInt(slider.max);
    const value = parseInt(slider.value);
    const percentage = ((value - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, #5c5c5c 0%, #5c5c5c ${percentage}%, #ddd ${percentage}%, #ddd 100%)`;
  }

  updateThicknessSliderBackground(slider) {
    const min = parseInt(slider.min);
    const max = parseInt(slider.max);
    const value = parseInt(slider.value);
    const percentage = ((value - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, #5c5c5c 0%, #5c5c5c ${percentage}%, #ddd ${percentage}%, #ddd 100%)`;
  }

  showLayerControls() {
    const layerButtons = document.getElementById('layerButtons');
    if (layerButtons) {
      layerButtons.classList.remove('layer-disabled');
    }
  }

  hideLayerControls() {
    const layerButtons = document.getElementById('layerButtons');
    if (layerButtons) {
      layerButtons.classList.add('layer-disabled');
    }
  }

  bringToTop() {
    const activeObject = this.canvas.getActiveObject();
    if (activeObject) {
      this.canvas.bringToFront(activeObject);
      this.canvas.renderAll();
      this.saveState();

      this.showLayerFeedback('最前面に移動しました');
    }
  }

  bringToFront() {
    const activeObject = this.canvas.getActiveObject();
    if (activeObject) {
      activeObject.bringForward();
      this.canvas.renderAll();
      this.saveState();

      this.showLayerFeedback('前面に移動しました');
    }
  }

  sendToBack() {
    const activeObject = this.canvas.getActiveObject();
    if (activeObject) {
      activeObject.sendBackwards();
      this.canvas.renderAll();
      this.saveState();

      this.showLayerFeedback('背面に移動しました');
    }
  }

  sendToBottom() {
    const activeObject = this.canvas.getActiveObject();
    if (activeObject) {
      this.canvas.sendToBack(activeObject);
      this.canvas.renderAll();
      this.saveState();

      this.showLayerFeedback('最背面に移動しました');
    }
  }

  showLayerFeedback(message) {
    this.showToast(message);
  }

  showToast(message, type = 'success') {
    const existingToast = document.getElementById('toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${type === 'error' ? '#ff4444' : '#039578'};
      color: white;
      padding: 12px 24px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '1';
    }, 10);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  clearCanvas() {
    this.canvas.clear();
    this.canvas.backgroundColor = '#ffffff';
    this.canvas.renderAll();

    this.history = [];
    this.historyStep = -1;
    // [改善2] 背景画像もクリア
    this.backgroundImageDataURL = null;
    this.saveState();

    this.stepCounter = 1;

    this.showToast('キャンバスをクリアしました');
  }
}

function initializeApp() {
  if (typeof fabric === 'undefined') {
    console.error('Fabric.jsが読み込まれていません');
    return;
  }

  const app = new ScreenshotAnnotator();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  setTimeout(initializeApp, 100);
}

function showHelpModal() {
  const helpModal = document.getElementById('helpModal');
  const helpBody = document.getElementById('help-body');

  const helpContent = [
    '<h4>基本操作</h4>',
    '<p>スクリーンショットや動画ファイルに注釈を追加できるツールです。様々な描画ツールを使って、画像にマークアップを加えることができます。</p>',
    '<h4>描画ツール</h4>',
    '<ul>',
    '<li><strong>選択ツール (V)</strong>: オブジェクトを選択・移動・編集</li>',
    '<li><strong>テキスト (T)</strong>: テキストを追加（クリックして入力）</li>',
    '<li><strong>枠線（四角形） (R)</strong>: 四角形を描画</li>',
    '<li><strong>円・楕円 (C)</strong>: 円・楕円を描画</li>',
    '<li><strong>矢印 (A)</strong>: 矢印を描画</li>',
    '<li><strong>マーカー (P)</strong>: フリーハンドで線を描画（太さ・色を変更可能）。「直線」トグルをONにすると水平・垂直の直線になります。</li>',
    '<li><strong>モザイク (M)</strong>: モザイク効果を適用</li>',
    '<li><strong>ステップマーカー</strong>: クリックで連番（①, ②...）を追加</li>',
    '</ul>',
    '<h4>オブジェクトの編集</h4>',
    '<ul>',
    '<li><strong>テキストの書き換え</strong>: テキストをダブルクリックすると、その位置にカーソルが入り書き換えできます（全消えしません）。</li>',
    '<li><strong>複製</strong>: オブジェクトを右クリック →「複製」、または <code>Ctrl+D</code>。テキストボックスもコピーできます。</li>',
    '</ul>',
    '<h4>動画コントロール</h4>',
    '<ul>',
    '<li><strong>再生/停止</strong>: 動画の再生と一時停止</li>',
    '<li><strong>シーク</strong>: 再生位置の調整</li>',
    '<li><strong>ミュート</strong>: 音声のON/OFF切り替え</li>',
    '<li><strong>ループ</strong>: ループ再生のON/OFF</li>',
    '</ul>',
    '<h4>色とスタイル</h4>',
    '<ul>',
    '<li><strong>色選択</strong>: プリセット色またはカスタムカラー</li>',
    '<li><strong>塗りつぶし</strong>: ONにすると図形（四角形・円）を選択した色で塗りつぶします。選択中の図形にも即時反映されます。</li>',
    '<li><strong>角丸</strong>: 四角形の角を「丸角」と「直角」で切り替えます。選択中の四角形にも反映されます。</li>',
    '<li><strong>直線</strong>: マーカーツール選択時に表示。ONにするとマーカーが水平・垂直の直線になります（ドラッグ方向で自動判定）。</li>',
    '<li><strong>太さ</strong>: 線の太さを1-10で調整</li>',
    '<li><strong>フォント</strong>: テキストサイズを調整</li>',
    '<li><strong>グラデーション</strong>: カラフルなグラデーション効果</li>',
    '</ul>',
    '<h4>レイヤー操作</h4>',
    '<ul>',
    '<li><strong>最前面</strong>: オブジェクトを最前面に移動</li>',
    '<li><strong>前面</strong>: オブジェクトを1つ前面に移動</li>',
    '<li><strong>背面</strong>: オブジェクトを1つ背面に移動</li>',
    '<li><strong>最背面</strong>: オブジェクトを最背面に移動</li>',
    '</ul>',
    '<h4>保存と共有</h4>',
    '<ul>',
    '<li><strong>保存</strong>: 現在の画面をPNG画像として保存（2倍解像度）</li>',
    '<li><strong>コピー</strong>: 画像をクリップボードにコピー（2倍解像度）</li>',
    '<li><strong>範囲指定</strong>: ONにすると保存/コピー時にトリミング範囲を指定できます。オブジェクトの範囲を自動検出し、手動で微調整も可能です。</li>',
    '<li><strong>クリア</strong>: すべてのオブジェクトを削除</li>',
    '</ul>',
    '<h4>キーボードショートカット</h4>',
    '<ul>',
    '<li><code>V</code>: 選択ツール</li>',
    '<li><code>T</code>: テキストツール</li>',
    '<li><code>R</code>: 枠線（四角形）ツール</li>',
    '<li><code>C</code>: 円・楕円ツール</li>',
    '<li><code>A</code>: 矢印ツール</li>',
    '<li><code>P</code>: マーカーツール</li>',
    '<li><code>M</code>: モザイクツール</li>',
    '<li><code>Ctrl+Z</code>: 元に戻す</li>',
    '<li><code>Ctrl+Y</code>: やり直し</li>',
    '<li><code>Ctrl+D</code>: 選択したオブジェクトを複製</li>',
    '<li><code>Delete</code>: 選択したオブジェクトを削除</li>',
    '<li><code>Escape</code>: テキスト編集を終了</li>',
    '</ul>'
  ];

  helpBody.innerHTML = helpContent.join('');
  helpModal.classList.add('active');
}

function hideHelpModal() {
  const helpModal = document.getElementById('helpModal');
  helpModal.classList.remove('active');
}

document.addEventListener('DOMContentLoaded', function () {
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const helpClose = helpModal ? helpModal.querySelector('.help-close') : null;

  if (helpBtn) {
    helpBtn.addEventListener('click', showHelpModal);
  }

  if (helpClose) {
    helpClose.addEventListener('click', function (e) {
      e.stopPropagation();
      hideHelpModal();
    });
  }

  if (helpModal) {
    helpModal.addEventListener('click', function (e) {
      if (e.target === helpModal || e.target.classList.contains('help-modal-overlay')) {
        hideHelpModal();
      }
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      const cropModal = document.getElementById('cropModal');
      if (cropModal && cropModal.classList.contains('active')) {
        cropModal.classList.remove('active');
        return;
      }
      const helpModal = document.getElementById('helpModal');
      if (helpModal && helpModal.classList.contains('active')) {
        hideHelpModal();
      }
    }
  });
});
