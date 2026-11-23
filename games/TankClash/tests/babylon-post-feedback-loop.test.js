const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function extractBabylonPostSource() {
    const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
    const startIdx = mainSrc.indexOf('const babylonPost = {');
    assert.notStrictEqual(startIdx, -1, 'main.js must define babylonPost');
    const endMarkerIdx = mainSrc.indexOf('function animate(now)', startIdx);
    assert.notStrictEqual(endMarkerIdx, -1, 'main.js must define animate after babylonPost');
    const blockEndIdx = mainSrc.lastIndexOf('};', endMarkerIdx);
    assert.notStrictEqual(blockEndIdx, -1, 'babylonPost object literal must terminate before animate');
    return mainSrc.slice(startIdx, blockEndIdx + 2);
}

function createBabylonPostHarness({ useSSAO = false, width = 1280, height = 720 } = {}) {
    let bufferWidth = width;
    let bufferHeight = height;
    let nextTargetId = 1;
    const allocatedTargets = [];
    const drawCalls = [];
    const mockScene = { name: 'mainScene' };

    class Vector2 {
        constructor(x = 0, y = 0) {
            this.x = x;
            this.y = y;
        }
        set(x, y) {
            this.x = x;
            this.y = y;
            return this;
        }
    }

    class Matrix4 {
        copy() {
            return this;
        }
    }

    class OrthographicCamera {}
    class Scene {
        constructor() {
            this.children = [];
        }
        add(obj) {
            this.children.push(obj);
        }
    }
    class PlaneGeometry {}
    class ShaderMaterial {
        constructor(params) {
            this.uniforms = params.uniforms || {};
        }
    }
    class Mesh {
        constructor(geometry, material) {
            this.geometry = geometry;
            this.material = material;
        }
    }
    class DepthTexture {
        constructor(w, h, type) {
            this.id = `depth-${nextTargetId++}`;
            this.width = w;
            this.height = h;
            this.type = type;
            this.disposed = false;
        }
        dispose() {
            this.disposed = true;
        }
    }
    class WebGLRenderTarget {
        constructor(w, h, opts = {}) {
            this.id = `rt-${nextTargetId++}`;
            this.width = w;
            this.height = h;
            this.opts = opts;
            this.texture = { id: `tex-${this.id}` };
            this.depthTexture = opts.depthTexture || null;
            this.disposed = false;
            allocatedTargets.push(this);
        }
        dispose() {
            this.disposed = true;
        }
    }

    const THREE = {
        LinearFilter: 'LinearFilter',
        NearestFilter: 'NearestFilter',
        RGBAFormat: 'RGBAFormat',
        HalfFloatType: 'HalfFloatType',
        UnsignedByteType: 'UnsignedByteType',
        UnsignedIntType: 'UnsignedIntType',
        Vector2,
        Matrix4,
        OrthographicCamera,
        Scene,
        PlaneGeometry,
        ShaderMaterial,
        Mesh,
        DepthTexture,
        WebGLRenderTarget
    };

    let currentTarget = null;
    const renderer = {
        capabilities: { isWebGL2: true },
        extensions: { get: () => ({}) },
        toneMappingExposure: 1.0,
        getDrawingBufferSize(out) {
            return out.set(bufferWidth, bufferHeight);
        },
        getRenderTarget() {
            return currentTarget;
        },
        setRenderTarget(rt) {
            currentTarget = rt;
        },
        clear() {},
        render(renderedScene, _camera) {
            if (renderedScene === mockScene) {
                drawCalls.push({
                    type: 'scene',
                    target: currentTarget,
                    material: null,
                    boundTextures: []
                });
                return;
            }
            const quadMesh = renderedScene.children[0];
            const uniforms = (quadMesh && quadMesh.material && quadMesh.material.uniforms) || {};
            const uniformValues = {};
            const boundTextures = [];
            for (const [name, u] of Object.entries(uniforms)) {
                uniformValues[name] = u ? u.value : undefined;
                if (u && u.value && typeof u.value === 'object' && typeof u.value.id === 'string') {
                    boundTextures.push({ name, value: u.value });
                }
            }
            drawCalls.push({
                type: 'quad',
                target: currentTarget,
                material: quadMesh.material,
                uniformValues,
                boundTextures
            });
        }
    };

    const windowMock = {
        getGraphicsMode: () => 'high'
    };

    const babylonPostSrc = extractBabylonPostSource();
    const factory = new Function(
        'THREE',
        'renderer',
        'scene',
        'window',
        'hasHalfFloatColorBuffer',
        'useSSAO',
        'isMobileBrowser',
        'isMobileDevice',
        `${babylonPostSrc}\nreturn babylonPost;`
    );

    const babylonPost = factory(
        THREE,
        renderer,
        mockScene,
        windowMock,
        () => true,
        useSSAO,
        () => false,
        () => false
    );

    const renderCamera = {
        projectionMatrix: new Matrix4(),
        projectionMatrixInverse: new Matrix4()
    };

    return {
        babylonPost,
        renderCamera,
        drawCalls,
        allocatedTargets,
        setBufferSize(w, h) {
            bufferWidth = w;
            bufferHeight = h;
        }
    };
}

function assertNoFeedbackLoops(drawCalls) {
    for (let idx = 0; idx < drawCalls.length; idx++) {
        const call = drawCalls[idx];
        if (!call.target) continue;
        for (const bound of call.boundTextures) {
            assert.notStrictEqual(
                bound.value,
                call.target.texture,
                `Draw call #${idx} binds active target texture (${bound.name}) while rendering into ${call.target.id}`
            );
            if (call.target.depthTexture) {
                assert.notStrictEqual(
                    bound.value,
                    call.target.depthTexture,
                    `Draw call #${idx} binds active target depthTexture (${bound.name}) while rendering into ${call.target.id}`
                );
            }
        }
    }
}

test('babylonPost renders without framebuffer/texture feedback loops (default and SSAO modes)', () => {
    for (const useSSAO of [false, true]) {
        const harness = createBabylonPostHarness({ useSSAO });
        const { babylonPost, renderCamera, drawCalls } = harness;

        babylonPost.render(renderCamera);
        babylonPost.render(renderCamera);

        assertNoFeedbackLoops(drawCalls);

        // Inspect upsample and composite passes on the first frame
        const upsampleCalls = drawCalls.filter(
            (c) => c.type === 'quad' && c.material === babylonPost.upsampleMat
        );
        assert.strictEqual(upsampleCalls.length, 6, '2 frames x 3 upsample passes expected');

        // Frame 1 upsample passes: 3 -> 2 -> 1 -> 0
        assert.strictEqual(upsampleCalls[0].target, babylonPost.bloomUpRTs[2]);
        assert.strictEqual(upsampleCalls[0].uniformValues.tSrc, babylonPost.bloomRTs[3].texture);
        assert.strictEqual(upsampleCalls[0].uniformValues.tAdd, babylonPost.bloomRTs[2].texture);

        assert.strictEqual(upsampleCalls[1].target, babylonPost.bloomUpRTs[1]);
        assert.strictEqual(upsampleCalls[1].uniformValues.tSrc, babylonPost.bloomUpRTs[2].texture);
        assert.strictEqual(upsampleCalls[1].uniformValues.tAdd, babylonPost.bloomRTs[1].texture);

        assert.strictEqual(upsampleCalls[2].target, babylonPost.bloomUpRTs[0]);
        assert.strictEqual(upsampleCalls[2].uniformValues.tSrc, babylonPost.bloomUpRTs[1].texture);
        assert.strictEqual(upsampleCalls[2].uniformValues.tAdd, babylonPost.bloomRTs[0].texture);

        const compositeCalls = drawCalls.filter(
            (c) => c.type === 'quad' && c.material === babylonPost.compositeMat
        );
        assert.strictEqual(compositeCalls.length, 2, '2 frames x 1 composite pass expected');
        assert.strictEqual(compositeCalls[0].target, null);
        assert.strictEqual(compositeCalls[0].uniformValues.tScene, babylonPost.hdrRT.texture);
        assert.strictEqual(compositeCalls[0].uniformValues.tBloom, babylonPost.bloomUpRTs[0].texture);
    }
});

test('babylonPost disposes all bloomRTs and bloomUpRTs on resize and reallocates cleanly', () => {
    const harness = createBabylonPostHarness({ useSSAO: false, width: 1280, height: 720 });
    const { babylonPost, renderCamera, drawCalls } = harness;

    babylonPost.render(renderCamera);

    const firstHdr = babylonPost.hdrRT;
    const firstDown = [...babylonPost.bloomRTs];
    const firstUp = [...babylonPost.bloomUpRTs];
    assert.strictEqual(firstDown.length, 4);
    assert.strictEqual(firstUp.length, 3);
    for (let i = 0; i < 3; i++) {
        assert.strictEqual(firstUp[i].width, firstDown[i].width);
        assert.strictEqual(firstUp[i].height, firstDown[i].height);
    }

    harness.setBufferSize(1920, 1080);
    babylonPost.render(renderCamera);

    assert.strictEqual(firstHdr.disposed, true);
    for (const rt of firstDown) assert.strictEqual(rt.disposed, true);
    for (const rt of firstUp) assert.strictEqual(rt.disposed, true);

    assert.strictEqual(babylonPost.bloomRTs.length, 4);
    assert.strictEqual(babylonPost.bloomUpRTs.length, 3);
    assert.strictEqual(babylonPost.hdrRT.width, 1920);
    assert.strictEqual(babylonPost.hdrRT.height, 1080);
    assertNoFeedbackLoops(drawCalls);
});
