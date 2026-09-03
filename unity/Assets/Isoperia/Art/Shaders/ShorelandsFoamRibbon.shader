Shader "Isoperia/M0/Shorelands Foam Ribbon"
{
    Properties { _FoamColor("Foam color", Color)=(.9,.95,.84,.9) _WaveAmplitude("Wave amplitude", Range(0,.2))=.035 _WaveSpeed("Wave speed", Range(0,4))=1.4 }
    SubShader { Tags { "RenderPipeline"="UniversalPipeline" "Queue"="Transparent" "RenderType"="Transparent" }
        Pass { Name "Forward" Tags { "LightMode"="UniversalForward" } Blend SrcAlpha OneMinusSrcAlpha ZWrite Off Cull Off
        HLSLPROGRAM
        #pragma vertex Vert
        #pragma fragment Frag
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        CBUFFER_START(UnityPerMaterial) half4 _FoamColor; half _WaveAmplitude; half _WaveSpeed; CBUFFER_END
        struct A { float4 positionOS:POSITION; float2 uv:TEXCOORD0; };
        struct V { float4 positionHCS:SV_POSITION; float2 uv:TEXCOORD0; };
        V Vert(A i) { V o; float phase=i.positionOS.x*.42+_Time.y*_WaveSpeed; i.positionOS.z+=sin(phase)*_WaveAmplitude*(1-i.uv.y); o.positionHCS=TransformObjectToHClip(i.positionOS.xyz); o.uv=i.uv; return o; }
        half4 Frag(V i):SV_Target { half edge=saturate(1-abs(i.uv.y-.5)*2); half shimmer=.72h+.28h*sin(i.uv.x*42+_Time.y*_WaveSpeed); return half4(_FoamColor.rgb,_FoamColor.a*edge*shimmer); }
        ENDHLSL }
    }
}
