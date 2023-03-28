let vs = `
    struct VertexInput {
        @location(0) position: vec3<f32>,
        @location(1) color: vec3<f32>
    };

    struct VertexOut {
        @builtin(position) position: vec4<f32>,
        @location(0) color: vec4<f32>
    };


    struct paramsUniform {
        width_x:f32,
        width_y:f32,
        width_z:f32,
        x_min: f32,
        y_min: f32,
        z_min: f32,
        current_Axis: f32
    };

    struct cmapUniform {
        colors: array<vec4<f32>, 10>
    };

    @group(0) @binding(0) var<uniform> MVP_Matrix: mat4x4<f32>;
    @group(0) @binding(1) var<uniform> cMap: cmapUniform;
    @group(0) @binding(2) var<uniform> params: paramsUniform;

    const direction = array<vec2<f32>, 4>(
        vec2<f32>(-1, -1),
        vec2<f32>(1, -1),
        vec2<f32>(-1, 1),
        vec2<f32>(1, 1)
    );
    
    @vertex
    fn main(in: VertexInput, @builtin(instance_index) inst_index:u32)->VertexOut{
        var out:VertexOut;
        var cMapIndex:i32; 
        var radius:f32 = 2.0;
        var position:vec3<f32> = in.position - vec3(params.x_min, params.y_min, params.z_min) - 0.5*vec3(params.width_x, params.width_y, params.width_z);
        if(params.current_Axis == 2.0){
            cMapIndex = i32(abs(in.position.z - params.z_min)/params.width_z *9);
        }
        else if(params.current_Axis == 1.0){
            cMapIndex = i32(abs(in.position.y - params.y_min)/params.width_y *9);
        }
        else {
            cMapIndex = i32(abs(in.position.x - params.x_min)/params.width_x *9);
        }
        let cmapped = cMap.colors[cMapIndex];
        out.color = vec4(cmapped.x, cmapped.y, cmapped.z, in.color.x);
        position = position + vec3<f32>(direction[inst_index], 1.0)*radius;
        out.position = MVP_Matrix* vec4<f32>(position, 1.0);
        return out;
    }
`;

let fs = `
struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>
};

@fragment
fn main(in:VertexOut)->@location(0) vec4<f32>{
    return in.color;
}
`;

export { fs, vs };
