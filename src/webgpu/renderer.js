import { vs, fs } from "../shaders/renderShader.js";
import { bufferMap, retrivePoints } from "../index.js";
import Stats from "three/examples/jsm/libs/stats.module";

let adapter = null;
let device = null;
let worldViewProj = mat4.create();
var projView = mat4.create();
let proj;
let camera;
let context = null;
let swapChainFormat = "bgra8unorm";
let renderPipeline;
let mvp_BG;
let positionBuffer;
let colorBuffer;
let MVP_Buffer;
var lasInfoBuffer;
let commandEncoder;
let renderPassDescriptor;
let renderDepthTexture;
let canvas;
let numPoints;
let positions, colors;
let keyMap = {
  isDown: false,
  dragging: false,
};
let debounceTimeOutId = null;
let colorMapBuffer;
let paramsBuffer;
let currentAxis = 2;
let param;
const stats = Stats();
document.body.appendChild(stats.dom);

function throttle(callback, interval) {
  let enableCall = true;
  return function (...args) {
    if (!enableCall) return;
    console.log("called now");
    enableCall = false;
    callback.apply(this, args);
    setTimeout(() => (enableCall = true), interval);
  };
}

let throttleTreeTravel = throttle(retrivePoints, 2000);

function configureSwapChain(device) {
  context.configure({
    device: device,
    format: swapChainFormat,
    usage: GPUTextureUsage.RenderAttachment,
    alphaMode: "premultiplied",
  });
}

function goToFallback() {
  console.error("unable to start webgpu");
  return;
}

function recoverFromDeviceLoss(data) {
  console.log("device is lost");
}

(() => {
  const selectColormap = document.getElementById("colormap-axis");
  selectColormap.addEventListener("change", (event) => {
    const axis = parseInt(event.target.value);
    if (axis != currentAxis) {
      currentAxis = axis;
      updateAxis();
    }
  });
})();

async function updateAxis() {
  param[param.length - 1] = currentAxis;
  const stagingBuffer = device.createBuffer({
    usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
    size: 28,
    mappedAtCreation: true,
  });

  const stagingData = new Float32Array(stagingBuffer.getMappedRange());
  stagingData.set(param);
  stagingBuffer.unmap();
  const copyEncoder = device.createCommandEncoder();
  copyEncoder.copyBufferToBuffer(stagingBuffer, 24, paramsBuffer, 24, 4);
  device.queue.submit([copyEncoder.finish()]);
}

async function init() {
  adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return goToFallback();
  device = await adapter.requestDevice();
  if (!device) return goToFallback();
  console.log("device is", device);
  // device.lost.then(recoverFromDeviceLoss);

  canvas = document.getElementById("screen-canvas");
  context = canvas.getContext("webgpu");
  if (!context) {
    console.error("coould not get context from the canvas");
    return;
  }
  canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
  canvas.height = window.innerHeight * (window.devicePixelRatio || 1);

  swapChainFormat = navigator.gpu.getPreferredCanvasFormat();
  configureSwapChain(device);
  canvas.addEventListener("mousedown", (e) => {
    if (e.buttons == 1 || e.buttons == 2) {
      keyMap["isDown"] = true;
    }
  });

  window.addEventListener("mouseup", (e) => {
    keyMap["isDown"] = false;
  });

  canvas.addEventListener("mousemove", () => {
    if (keyMap["isDown"] == true) {
      let cameraPosition = camera.eyePos();
      throttleTreeTravel(projView);
    }
  });

  window.addEventListener("wheel", () => {
    throttleTreeTravel(projView);
  });
}

async function intRenderPipeline() {
  let Vertex_Buffer_Descriptor = [{}];
  let vs_module = device.createShaderModule({
    label: "vertex shader",
    code: vs,
  });

  let fs_module = device.createShaderModule({
    label: "fragment shader",
    code: fs,
  });

  let positionAttribute_Desc = {
    shaderLocation: 0,
    offset: 0,
    format: "float32x3",
  };

  let colorAttribute_Desc = {
    shaderLocation: 1,
    offset: 0,
    format: "float32x3",
  };

  let Vertex_Shader_Descriptor = {
    module: vs_module,
    entryPoint: "main",
    buffers: [
      {
        arrayStride: 12,
        attributes: [positionAttribute_Desc],
      },
      {
        arrayStride: 12,
        attributes: [colorAttribute_Desc],
      },
    ],
  };

  let Fragment_Shader_Descriptor = {
    module: fs_module,
    entryPoint: "main",
    targets: [{ format: swapChainFormat }],
  };

  let Depth_Stencil_Descriptor = {
    format: "depth24plus-stencil8",
    depthWriteEnabled: true,
    depthCompare: "less",
  };

  let Primitive_Descriptor = {
    topology: "point-list",
    cullMode: "none",
    frontFace: "ccw",
  };

  renderPipeline = await device.createRenderPipeline({
    label: "render pipeline",
    layout: "auto",
    vertex: Vertex_Shader_Descriptor,
    fragment: Fragment_Shader_Descriptor,
    depthStencil: Depth_Stencil_Descriptor,
    primitive: Primitive_Descriptor,
  });
}

async function initVertexBuffer() {
  let totalNumberOfPoints = numPoints;
  console.log(totalNumberOfPoints);
  positionBuffer = device.createBuffer({
    label: "vertex position buffer",
    size: totalNumberOfPoints * 12,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });

  let mapArrayPosition = new Float32Array(positionBuffer.getMappedRange());
  mapArrayPosition.set(positions);
  positionBuffer.unmap();

  colorBuffer = device.createBuffer({
    label: "vertex color buffer",
    size: totalNumberOfPoints * 12,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });

  let mapArrayColor = new Float32Array(colorBuffer.getMappedRange());
  mapArrayColor.set(colors);
  colorBuffer.unmap();
}

function initUniform(cam, projMatrix, params) {
  camera = cam;
  proj = projMatrix;
  param = params;
  params.push(currentAxis);
  // params
  paramsBuffer = device.createBuffer({
    size: 7 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  let mapArray_params = new Float32Array(paramsBuffer.getMappedRange());

  mapArray_params.set(params);
  paramsBuffer.unmap();

  function get1DArray(arr) {
    return +arr.join().split(",");
  }
  // create colormap
  let hsv_colors = [
    [1, 0, 0, 0.0],
    [0.0, 1.0, 0, 0.0],
    [0.97, 1, 0.01, 0.0],
    [0, 0.99, 0.04, 0.0],
    [0, 0.98, 0.52, 0.0],
    [0, 0.98, 1, 0.0],
    [0.01, 0.49, 1, 0.0],
    [0.03, 0, 0.99, 0.0],
    [1, 0, 0.96, 0.0],
    [1, 0, 0.49, 0.0],
  ];

  colorMapBuffer = device.createBuffer({
    size: 160,
    usage: GPUBufferUsage.UNIFORM,
    mappedAtCreation: true,
  });

  let mapArray = new Float32Array(colorMapBuffer.getMappedRange());
  hsv_colors = hsv_colors.flat();
  mapArray.set(hsv_colors);
  colorMapBuffer.unmap();

  MVP_Buffer = device.createBuffer({
    size: 16 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  var controller = new Controller();

  controller.mousemove = function (prev, cur, evt) {
    if (evt.buttons == 1) {
      // console.log("rotate");
      camera.rotate(prev, cur);
    } else if (evt.buttons == 2) {
      camera.pan([cur[0] - prev[0], prev[1] - cur[1]]);
    }
  };
  controller.wheel = function (amt) {
    // console.log(amt);
    camera.zoom(amt);
  };
  controller.pinch = controller.wheel;
  controller.twoFingerDrag = function (drag) {
    camera.pan(drag);
  };
  controller.registerForCanvas(canvas);
  var canvasVisible = false;
  var observer = new IntersectionObserver(
    function (e) {
      if (e[0].isIntersecting) {
        canvasVisible = true;
      } else {
        canvasVisible = false;
      }
    },
    { threshold: [0] }
  );
  observer.observe(canvas);
  projView = mat4.mul(projView, proj, camera.camera);
  return projView;
}

async function createBindGroups() {
  mvp_BG = device.createBindGroup({
    label: "uniform bindgroup - rendering",
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: MVP_Buffer,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: colorMapBuffer,
        },
      },
      {
        binding: 2,
        resource: {
          buffer: paramsBuffer,
        },
      },
    ],
  });
}

async function createDepthBuffer() {
  renderDepthTexture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: "depth24plus-stencil8",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

async function encodedCommand() {
  // create render pass descriptor

  let colorAttachment = {
    view: context.getCurrentTexture().createView(),
    clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
    loadOp: "clear",
    storeOp: "store",
  };

  let depthAttachment = {
    view: renderDepthTexture.createView(),
    depthLoadOp: "clear",
    depthClearValue: 1.0,
    depthStoreOp: "store",
    stencilLoadOp: "clear",
    stencilClearValue: 0,
    stencilStoreOp: "store",
  };

  renderPassDescriptor = {
    colorAttachments: [colorAttachment],
    depthStencilAttachment: depthAttachment,
  };
}

async function update(timestamp) {
  {
    // update worldViewProj
    let proj = mat4.create();
    let view = mat4.create();

    {
      // proj
      const aspect = Math.abs(canvas.width / canvas.height);
      mat4.perspective(proj, 90, aspect, 0.1, 1000.0);
    }

    {
      // view
      let target = vec3.fromValues(2, 5, 0);
      // let r = 50;
      // let x = r * Math.sin(timestamp / 10) + target[0];
      // let y = r * Math.cos(timestamp / 10) + target[1];
      // let z = 10;

      let position = vec3.fromValues(5, 100, 100);
      let up = vec3.fromValues(0, 0, 1);
      mat4.lookAt(view, position, target, up);
    }
    mat4.multiply(worldViewProj, proj, view);
  }
}

async function stages(camera, proj, params) {
  await init();
  await intRenderPipeline();
  let projectionViewMatrix = await initUniform(camera, proj, params);
  return projectionViewMatrix;
}

// ---------------------------------------------------------------------------
// i guess i am not using this

async function renderStages(position, color) {
  console.log(" i am insider another render");
  numPoints = position.length / 3;
  positions = position;
  colors = color;
  console.log(positions);
  await initVertexBuffer();
  await createBindGroups();
  await createDepthBuffer();
  requestAnimationFrame(render2);
}
// -----------------------------------------------------------------------------

async function renderWrapper() {
  await createBindGroups();
  await createDepthBuffer();
  requestAnimationFrame(render);

  function render2(timestamp) {
    commandEncoder = device.createCommandEncoder();
    projView = mat4.mul(projView, proj, camera.camera);
    // update(timestamp);
    encodedCommand();

    // device.queue.writeBuffer(MVP_Buffer, 0, worldViewProj, 16);

    let wvStagingBuffer = device.createBuffer({
      size: 4 * 16,
      usage: GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });
    const stagingUniformData = new Float32Array(
      wvStagingBuffer.getMappedRange()
    );
    stagingUniformData.set(projView);
    wvStagingBuffer.unmap();
    commandEncoder.copyBufferToBuffer(wvStagingBuffer, 0, MVP_Buffer, 0, 64);
    let renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
    renderPass.setPipeline(renderPipeline);
    renderPass.setViewport(0, 0, canvas.width, canvas.height, 0.0, 1.0);
    renderPass.setBindGroup(0, mvp_BG);
    renderPass.setVertexBuffer(0, positionBuffer);
    renderPass.setVertexBuffer(1, colorBuffer);
    renderPass.draw(numPoints, 1, 0, 0);
    renderPass.end();
    device.queue.submit([commandEncoder.finish()]);
    requestAnimationFrame(render);
  }

  function render(timestamp) {
    stats.update();
    var startTime = performance.now();
    commandEncoder = device.createCommandEncoder();
    projView = mat4.mul(projView, proj, camera.camera);
    // update(timestamp);
    encodedCommand();

    // device.queue.writeBuffer(MVP_Buffer, 0, worldViewProj, 16);

    let wvStagingBuffer = device.createBuffer({
      size: 4 * 16,
      usage: GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });
    const stagingUniformData = new Float32Array(
      wvStagingBuffer.getMappedRange()
    );
    stagingUniformData.set(projView);
    wvStagingBuffer.unmap();
    commandEncoder.copyBufferToBuffer(wvStagingBuffer, 0, MVP_Buffer, 0, 64);
    let renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
    renderPass.setPipeline(renderPipeline);
    renderPass.setViewport(0, 0, canvas.width, canvas.height, 0.0, 1.0);
    renderPass.setBindGroup(0, mvp_BG);
    for (let key in bufferMap) {
      renderPass.setVertexBuffer(0, bufferMap[key].position);
      renderPass.setVertexBuffer(1, bufferMap[key].color);
      // console.log("length is", +bufferMap[key].position.label / 3);
      numPoints = +bufferMap[key].position.label / 3;
      renderPass.draw(numPoints, 4, 0, 0);
    }
    renderPass.end();
    device.queue.submit([commandEncoder.finish()]);
    var endTime = performance.now();
    requestAnimationFrame(render);
  }
}

export { renderStages, device, stages, renderWrapper };
