Shader "Isoperia/M0/Shorelands Atlas Surface"
{
    Properties { _Atlas("Shorelands atlas", 2D) = "white" {} _Ambient("Ambient", Range(0,1)) = .45 }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Opaque" "Queue"="Geometry" }
        Pass
        {
            Name "ForwardLit" Tags { "LightMode"="UniversalForward" }
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            CBUFFER_START(UnityPerMaterial) half _Ambient; CBUFFER_END
            TEXTURE2D(_Atlas); SAMPLER(sampler_Atlas);
            struct A { float4 positionOS:POSITION; float3 normalOS:NORMAL; half4 color:COLOR; };
            struct V { float4 positionHCS:SV_POSITION; float3 positionWS:TEXCOORD0; half3 normalWS:TEXCOORD1; half4 color:COLOR; };
            half3 Band(half tone, half band) { return SAMPLE_TEXTURE2D(_Atlas, sampler_Atlas, half2((.5h + saturate(tone)*255.0h)/256.0h, (band+.5h)/5.0h)).rgb; }
            V Vert(A i) { V o; VertexPositionInputs p=GetVertexPositionInputs(i.positionOS.xyz); o.positionHCS=p.positionCS; o.positionWS=p.positionWS; o.normalWS=TransformObjectToWorldNormal(i.normalOS); o.color=i.color; return o; }
            half4 Frag(V i):SV_Target
            {
                half4 w=max(i.color, 0); half total=max(.0001h, w.r+w.g+w.b+w.a); w/=total;
                // Sample each palette band independently, then blend colours. Never interpolate atlas V.
                // The four vertex-colour weights cover the non-water surface
                // families. Water has its own shader, so retain the timber band
                // here instead of skipping it for the sea band.
                half3 albedo=w.r*Band(.55h,0)+w.g*Band(.48h,1)+w.b*Band(.50h,2)+w.a*Band(.43h,4);
                Light l=GetMainLight(TransformWorldToShadowCoord(i.positionWS));
                half diffuse=saturate(dot(normalize(i.normalWS),l.direction))*l.shadowAttenuation;
                return half4(albedo*(_Ambient+l.color*(diffuse*.65h)),1);
            }
            ENDHLSL
        }
    }
}
