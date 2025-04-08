"use client";

import React, { cloneElement, isValidElement } from 'react';
import { useEffect, useState } from 'react'

interface ClientWrapperProps {
  children: React.ReactElement<{ isloggedin: boolean }>;
}

export default function ClientWrapper({ children }: ClientWrapperProps) {
  const [isloggedin, setisloggedin] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    setisloggedin(!!token)
  }, [])

  return (
    <>
      {isValidElement(children) && cloneElement(children, { isloggedin: isloggedin.toString() })}
    </>
  )
}
