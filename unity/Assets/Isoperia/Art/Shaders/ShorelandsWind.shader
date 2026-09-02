Shader "Isoperia/M0/Shorelands Wind"
{
    Properties { _Atlas("Shorelands atlas",2D)="white"{} _WindStrength("Wind strength",Range(0,1))=.16 _WindSpeed("Wind speed",Range(0,4))=1.3 }
    SubShader { Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Opaque" }
        Pass { Name "ForwardLit" Tags { "LightMode"="UniversalForward" }
        HLSLPROGRAM
        #pragma vertex Vert
        #pragma fragment Frag
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
        CBUFFER_START(UnityPerMaterial) half _WindStrength; half _WindSpeed; CBUFFER_END
        TEXTURE2D(_Atlas); SAMPLER(sampler_Atlas);
        struct A { float4 positionOS:POSITION; float3 normalOS:NORMAL; float2 uv:TEXCOORD0; };
        struct V { float4 positionHCS:SV_POSITION; float3 positionWS:TEXCOORD0; half3 normalWS:TEXCOORD1; };
        V Vert(A i) { V o; float root=saturate(i.uv.y); float phase=_Time.y*_WindSpeed+dot(TransformObjectToWorld(i.positionOS.xyz).xz,float2(.19,.13)); i.positionOS.xz+=sin(phase)*_WindStrength*root; VertexPositionInputs p=GetVertexPositionInputs(i.positionOS.xyz); o.positionHCS=p.positionCS;o.positionWS=p.positionWS;o.normalWS=TransformObjectToWorldNormal(i.normalOS);return o; }
        half4 Frag(V i):SV_Target { half3 c=SAMPLE_TEXTURE2D(_Atlas,sampler_Atlas,half2(.52,.5)).rgb; Light l=GetMainLight(TransformWorldToShadowCoord(i.positionWS)); return half4(c*(.42+l.color*saturate(dot(normalize(i.normalWS),l.direction))*.6),1); }
        ENDHLSL }
    }
}
