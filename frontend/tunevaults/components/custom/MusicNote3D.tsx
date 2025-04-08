"use client";
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Box, Sphere, Cylinder } from '@react-three/drei'

export default function MusicNote3D() {
  const groupRef = useRef()

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5
    }
  })

  return (
    <group ref={groupRef}>
      {/* Note head */}
      <Sphere args={[0.5, 32, 32]} position={[0, 0, 0]}>
        <meshStandardMaterial color="#6366f1" />
      </Sphere>

      {/* Note stem */}
      <Box args={[0.1, 2, 0.1]} position={[0, 1, 0]}>
        <meshStandardMaterial color="#6366f1" />
      </Box>

      {/* Note flag */}
      <Cylinder args={[0.2, 0, 0.8, 32]} position={[0.2, 1.8, 0]} rotation={[0, 0, Math.PI / 4]}>
        <meshStandardMaterial color="#6366f1" />
      </Cylinder>
    </group>
  )
}

