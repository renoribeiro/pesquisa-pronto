import React from "react";
import Image from "next/image";
import logoImg from "./Logo-Prontoclinica-H-semDescritivo (1).png";

export function ProntoclinicaLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center select-none ${className}`}>
      <Image
        src={logoImg}
        alt="Logo Prontoclínica"
        className="h-10 w-auto object-contain max-w-full"
        priority
      />
    </div>
  );
}
