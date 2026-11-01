(function () {
    function placeSoldierWeaponInHand(rig, localWeaponQuat) {
        const pistolGrip = rig.rifleType === 'thompson' || rig.rifleType === 'mp40';
        const gripY = pistolGrip ? -0.065 : -0.035;
        const gripZ = pistolGrip ? -0.05 : -0.10;
        const rightGrip = new THREE.Vector3(0.025, gripY, gripZ).applyQuaternion(localWeaponQuat);
        rig.rifle.position.set(0, -0.036, 0.004).sub(rightGrip);
    }

    function getSoldierRightElbowPosition(shoulder, wrist) {
        const direction = wrist.clone().sub(shoulder);
        const distance = direction.length();
        direction.normalize();
        const upperLength = 0.265;
        const forearmLength = 0.24;
        const cosAlpha = THREE.MathUtils.clamp(
            (upperLength * upperLength + distance * distance - forearmLength * forearmLength) /
                (2 * upperLength * distance), -1, 1
        );
        const pole = new THREE.Vector3(-1, -0.45, 0).normalize();
        const bend = pole.sub(direction.clone().multiplyScalar(pole.dot(direction))).normalize();
        return shoulder.clone()
            .addScaledVector(direction, upperLength * cosAlpha)
            .addScaledVector(bend, upperLength * Math.sqrt(1 - cosAlpha * cosAlpha));
    }

    function poseSoldierWeapon(rig, aimDirection, heading, recoilKick = 0) {
        rig.rightArm.shoulder.rotation.set(-0.65 - recoilKick * 0.3, 0.12, 0.60);
        rig.rightArm.elbow.rotation.set(-2.20, 0, 0);
        rig.rightArm.wrist.rotation.set(0, 0, 0);
        rig.root.updateMatrixWorld(true);

        const rightShoulderPos = rig.rightArm.shoulder.position;
        const rightWristTorso = rig.torso.worldToLocal(
            rig.rightArm.wrist.getWorldPosition(new THREE.Vector3())
        );
        const rightElbowPos = getSoldierRightElbowPosition(rightShoulderPos, rightWristTorso);
        const rightUpper = rightElbowPos.clone().sub(rightShoulderPos).normalize();
        const rightUpperQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), rightUpper);
        rig.rightArm.shoulder.quaternion.copy(rightUpperQuat);
        rig.rightArm.shoulder.updateMatrixWorld(true);
        const rightForearm = rightWristTorso.clone().sub(rightElbowPos).normalize()
            .applyQuaternion(rightUpperQuat.clone().invert());
        rig.rightArm.elbow.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), rightForearm);
        rig.rightArm.elbow.updateMatrixWorld(true);

        const fwd = aimDirection.clone().normalize();
        const worldUp = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(worldUp, fwd);
        if (right.lengthSq() < 0.0001) {
            right.set(Math.cos(heading), 0, -Math.sin(heading));
        } else {
            right.normalize();
        }
        const realUp = new THREE.Vector3().crossVectors(fwd, right).normalize();
        const rotMat = new THREE.Matrix4().makeBasis(right, realUp, fwd);
        const targetWorldQuat = new THREE.Quaternion().setFromRotationMatrix(rotMat);
        const handWorldQuat = targetWorldQuat.clone().multiply(
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
        );

        const elbowWorldQuat = new THREE.Quaternion();
        rig.rightArm.elbow.getWorldQuaternion(elbowWorldQuat);
        rig.rightArm.wrist.quaternion.copy(elbowWorldQuat.invert().multiply(handWorldQuat));
        rig.rightArm.wrist.updateMatrixWorld(true);

        const wristWorldQuat = new THREE.Quaternion();
        rig.rightArm.wrist.getWorldQuaternion(wristWorldQuat);
        const localRifleQuat = wristWorldQuat.clone().invert().multiply(targetWorldQuat);
        rig.rifle.quaternion.copy(localRifleQuat);
        placeSoldierWeaponInHand(rig, localRifleQuat);
        rig.rifle.updateMatrixWorld(true);

        const gripWorld = rig.rifle.localToWorld(new THREE.Vector3(-0.025, -0.024, 0.064));
        const leftShoulderPos = rig.leftArm.shoulder.position;
        const gripTorso = rig.torso.worldToLocal(gripWorld.clone());
        const direction = gripTorso.clone().sub(leftShoulderPos);
        const dist = direction.length();
        const upperLength = 0.265;
        const forearmLength = 0.24;
        const targetDist = Math.min(dist, upperLength + forearmLength - 0.005);
        const cosAlpha = THREE.MathUtils.clamp(
            (upperLength * upperLength + targetDist * targetDist - forearmLength * forearmLength) /
                (2 * upperLength * targetDist), -1, 1
        );
        const alpha = Math.acos(cosAlpha);
        direction.normalize();
        const pole = new THREE.Vector3(0.5, -0.6, 0.4).normalize();
        let bend = pole.clone().sub(direction.clone().multiplyScalar(pole.dot(direction)));
        if (bend.lengthSq() < 0.001) bend = new THREE.Vector3(1, 0, 0);
        bend.normalize();

        const elbow = leftShoulderPos.clone()
            .add(direction.clone().multiplyScalar(upperLength * Math.cos(alpha)))
            .add(bend.clone().multiplyScalar(upperLength * Math.sin(alpha)));
        const upper = elbow.clone().sub(leftShoulderPos).normalize();
        const upperQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), upper);
        rig.leftArm.shoulder.quaternion.copy(upperQuat);
        rig.leftArm.shoulder.updateMatrixWorld(true);

        const forearm = gripTorso.clone().sub(elbow).normalize().applyQuaternion(upperQuat.clone().invert());
        const forearmQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), forearm);
        rig.leftArm.elbow.quaternion.copy(forearmQuat);
        rig.leftArm.elbow.updateMatrixWorld(true);
        const leftElbowWorldQuat = new THREE.Quaternion();
        rig.leftArm.elbow.getWorldQuaternion(leftElbowWorldQuat);
        rig.leftArm.wrist.quaternion.copy(leftElbowWorldQuat.invert().multiply(handWorldQuat));
        rig.leftArm.wrist.updateMatrixWorld(true);
    }

    window.placeSoldierWeaponInHand = placeSoldierWeaponInHand;
    window.getSoldierRightElbowPosition = getSoldierRightElbowPosition;
    window.poseSoldierWeapon = poseSoldierWeapon;
})();
