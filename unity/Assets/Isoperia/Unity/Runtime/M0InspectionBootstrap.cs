using UnityEngine;

namespace Isoperia.Unity.M0
{
    /// <summary>Scene-local M0 controls. Legacy startup is prevented at its source, never culled after startup.</summary>
    [DefaultExecutionOrder(-10000)]
    public sealed class M0InspectionBootstrap : MonoBehaviour
    {
        [SerializeField] private Transform inspectionPlayer;
        [SerializeField] private Camera inspectionCamera;

        private void Awake()
        {
            if (inspectionPlayer != null && inspectionPlayer.GetComponent<M0InspectionMotor>() == null)
                inspectionPlayer.gameObject.AddComponent<M0InspectionMotor>();
            if (inspectionCamera != null && inspectionCamera.GetComponent<M0InspectionCamera>() == null)
            {
                var orbit = inspectionCamera.gameObject.AddComponent<M0InspectionCamera>();
                orbit.Target = inspectionPlayer;
            }
        }

    }

    public sealed class M0InspectionMotor : MonoBehaviour
    {
        private CharacterController controller;
        private void Awake() { controller = GetComponent<CharacterController>() ?? gameObject.AddComponent<CharacterController>(); controller.height=1.7f; controller.radius=.35f; }
        private void Update()
        {
            Vector3 input = new Vector3(Input.GetAxisRaw("Horizontal"),0,Input.GetAxisRaw("Vertical"));
            if (input.sqrMagnitude > 1) input.Normalize();
            controller.Move(transform.TransformDirection(input) * 5f * Time.deltaTime + Physics.gravity * Time.deltaTime);
        }
    }

    public sealed class M0InspectionCamera : MonoBehaviour
    {
        public Transform Target { get; set; }
        private float yaw=35, pitch=18, distance=6;
        private void LateUpdate()
        {
            if (Target == null) return;
            if (Input.GetMouseButton(1)) { yaw += Input.GetAxis("Mouse X")*120f*Time.deltaTime; pitch=Mathf.Clamp(pitch-Input.GetAxis("Mouse Y")*90f*Time.deltaTime,8,55); }
            distance=Mathf.Clamp(distance-Input.mouseScrollDelta.y,3,9);
            Quaternion rotation=Quaternion.Euler(pitch,yaw,0); Vector3 desired=Target.position-rotation*Vector3.forward*distance+Vector3.up*1.25f;
            if (Physics.Linecast(Target.position+Vector3.up*1.25f,desired,out RaycastHit hit)) desired=hit.point+hit.normal*.12f;
            transform.position=Vector3.Lerp(transform.position,desired,1-Mathf.Exp(-10f*Time.deltaTime)); transform.rotation=rotation;
        }
    }
}
