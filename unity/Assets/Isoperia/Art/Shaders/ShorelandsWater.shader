Shader "Isoperia/M0/Shorelands Water"
{
    Properties { _Atlas("Shorelands atlas",2D)="white"{} _WaveScale("Wave scale",Range(0,2))=.18 _FoamDistance("Foam depth",Range(.1,8))=1.5 }
    SubShader { Tags { "RenderPipeline"="UniversalPipeline" "Queue"="Transparent" "RenderType"="Transparent" }
        Pass { Name "Forward" Tags { "LightMode"="UniversalForward" } Blend SrcAlpha OneMinusSrcAlpha ZWrite Off
        HLSLPROGRAM
        #pragma vertex Vert
        #pragma fragment Frag
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        CBUFFER_START(UnityPerMaterial) half _WaveScale; half _FoamDistance; CBUFFER_END
        TEXTURE2D(_Atlas); SAMPLER(sampler_Atlas); TEXTURE2D_X(_CameraDepthTexture); SAMPLER(sampler_CameraDepthTexture);
        struct A { float4 positionOS:POSITION; float2 uv:TEXCOORD0; };
        struct V { float4 positionHCS:SV_POSITION; float4 screenPos:TEXCOORD0; float2 uv:TEXCOORD1; float eyeDepth:TEXCOORD2; };
        V Vert(A i) { V o; i.positionOS.y+=sin((i.positionOS.x+i.positionOS.z)*.35+_Time.y)*_WaveScale; VertexPositionInputs p=GetVertexPositionInputs(i.positionOS.xyz);o.positionHCS=p.positionCS;o.screenPos=ComputeScreenPos(p.positionCS);o.uv=i.uv;o.eyeDepth=-TransformWorldToView(p.positionWS).z;return o; }
        half4 Frag(V i):SV_Target { half3 sea=SAMPLE_TEXTURE2D(_Atlas,sampler_Atlas,half2(.55,.7)).rgb; float raw=SAMPLE_TEXTURE2D_X(_CameraDepthTexture,sampler_CameraDepthTexture,i.screenPos.xy/i.screenPos.w).r; float scene=LinearEyeDepth(raw,_ZBufferParams); half foam=saturate(1-(scene-i.eyeDepth)/max(.01,_FoamDistance)); half3 foamC=SAMPLE_TEXTURE2D(_Atlas,sampler_Atlas,half2(.8,.1)).rgb; return half4(lerp(sea,foamC,foam*.8),.78); }
        ENDHLSL }
    }
}
