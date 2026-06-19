import React, { useRef, useEffect, useState } from "react";
import { Renderer, Program, Triangle, Mesh } from "ogl";
import StaggeredMenu from '../animation/StaggeredMenu';
import Orb from "../animation/Orb";

const hexToRgb = (hex) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? [
        parseInt(m[1], 16) / 255,
        parseInt(m[2], 16) / 255,
        parseInt(m[3], 16) / 255,
      ]
    : [1, 1, 1];
};

const originToFlip = (origin) => {
  switch (origin) {
    case "top-left":
      return [1, 0];
    case "bottom-right":
      return [0, 1];
    case "bottom-left":
      return [1, 1];
    default:
      return [0, 0]; // top-right default
  }
};

const SideRays = ({
  speed = 2.5,
  rayColor1 = "#EAB308",
  rayColor2 = "#96c8ff",
  intensity = 2,
  spread = 2,
  origin = "top-right",
  tilt = 0,
  saturation = 1.5,
  blend = 0.75,
  falloff = 1.6,
  opacity = 1.0,
  className = "",
  style = {},
}) => {
  const containerRef = useRef(null);
  const uniformsRef = useRef(null);
  const rendererRef = useRef(null);
  const animationIdRef = useRef(null);
  const meshRef = useRef(null);
  const cleanupFunctionRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (cleanupFunctionRef.current) {
      cleanupFunctionRef.current();
      cleanupFunctionRef.current = null;
    }

    const initializeWebGL = async () => {
      if (!containerRef.current) return;

      await new Promise((resolve) => setTimeout(resolve, 10));
      if (!containerRef.current) return;

      const renderer = new Renderer({
        dpr: Math.min(window.devicePixelRatio, 2),
        alpha: true,
      });
      rendererRef.current = renderer;

      const gl = renderer.gl;
      gl.canvas.style.width = "100%";
      gl.canvas.style.height = "100%";
      gl.canvas.style.display = "block";

      // Remove existing children:
      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild);
      }
      containerRef.current.appendChild(gl.canvas);

      const vert = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

      const frag = `precision highp float;

uniform float iTime;
uniform vec2 iResolution;
uniform float iSpeed;
uniform vec3 iRayColor1;
uniform vec3 iRayColor2;
uniform float iIntensity;
uniform float iSpread;
uniform float iFlipX;
uniform float iFlipY;
uniform float iTilt;
uniform float iSaturation;
uniform float iBlend;
uniform float iFalloff;
uniform float iOpacity;

float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord, float seedA, float seedB, float speed) {
  vec2 sourceToCoord = coord - raySource;
  float cosAngle = dot(normalize(sourceToCoord), rayRefDirection);
  return clamp(
    (0.45 + 0.15 * sin(cosAngle * seedA + iTime * speed)) +
    (0.3 + 0.2 * cos(-cosAngle * seedB + iTime * speed)),
    0.0, 1.0) *
    clamp((iResolution.x - length(sourceToCoord)) / iResolution.x, 0.5, 1.0);
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  if (iFlipX > 0.5) fragCoord.x = iResolution.x - fragCoord.x;
  if (iFlipY > 0.5) fragCoord.y = iResolution.y - fragCoord.y;

  vec2 coord = vec2(fragCoord.x, iResolution.y - fragCoord.y);
  vec2 rayPos = vec2(iResolution.x * 1.1, -0.5 * iResolution.y);

  float tiltRad = iTilt * 3.14159265 / 180.0;
  float cs = cos(tiltRad);
  float sn = sin(tiltRad);
  vec2 rel = coord - rayPos;
  vec2 tiltedCoord = vec2(rel.x * cs - rel.y * sn, rel.x * sn + rel.y * cs) + rayPos;

  float halfSpread = iSpread * 0.275;
  vec2 rayRefDir1 = normalize(vec2(cos(0.785398 + halfSpread), sin(0.785398 + halfSpread)));
  vec2 rayRefDir2 = normalize(vec2(cos(0.785398 - halfSpread), sin(0.785398 - halfSpread)));

  vec4 rays1 = vec4(iRayColor1, 1.0) * rayStrength(rayPos, rayRefDir1, tiltedCoord, 36.2214, 21.11349, iSpeed);
  vec4 rays2 = vec4(iRayColor2, 1.0) * rayStrength(rayPos, rayRefDir2, tiltedCoord, 22.3991, 18.0234, iSpeed * 0.2);

  vec4 color = rays1 * (1.0 - iBlend) * 0.9 + rays2 * iBlend * 0.9;

  float distanceToLight = length(fragCoord.xy - vec2(rayPos.x, iResolution.y - rayPos.y)) / iResolution.y;
  float brightness = iIntensity * 0.4 / pow(max(distanceToLight, 0.001), iFalloff);
  color.rgb *= brightness;

  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(vec3(gray), color.rgb, iSaturation);

  color.a = max(color.r, max(color.g, color.b)) * iOpacity;
  gl_FragColor = color;
}
`;

      const [flipX, flipY] = originToFlip(origin);

      const uniforms = {
        iTime: { value: 0 },
        iResolution: { value: [1, 1] },
        iSpeed: { value: speed },
        iRayColor1: { value: hexToRgb(rayColor1) },
        iRayColor2: { value: hexToRgb(rayColor2) },
        iIntensity: { value: intensity },
        iSpread: { value: spread },
        iFlipX: { value: flipX },
        iFlipY: { value: flipY },
        iTilt: { value: tilt },
        iSaturation: { value: saturation },
        iBlend: { value: blend },
        iFalloff: { value: falloff },
        iOpacity: { value: opacity },
      };
      uniformsRef.current = uniforms;

      const geometry = new Triangle(gl);
      const program = new Program(gl, {
        vertex: vert,
        fragment: frag,
        uniforms,
      });
      const mesh = new Mesh(gl, { geometry, program });
      meshRef.current = mesh;

      const updateSize = () => {
        if (!containerRef.current || !renderer) return;
        renderer.dpr = Math.min(window.devicePixelRatio, 2);
        const { clientWidth: w, clientHeight: h } = containerRef.current;
        renderer.setSize(w, h);
        uniforms.iResolution.value = [w * renderer.dpr, h * renderer.dpr];
      };

      const loop = (t) => {
        if (!rendererRef.current || !uniformsRef.current || !meshRef.current)
          return;
        uniforms.iTime.value = t * 0.001;
        try {
          renderer.render({ scene: mesh });
          animationIdRef.current = requestAnimationFrame(loop);
        } catch (e) {
          // swallow render error (do not propagate)
        }
      };

      window.addEventListener("resize", updateSize);
      updateSize();
      animationIdRef.current = requestAnimationFrame(loop);

      cleanupFunctionRef.current = () => {
        if (animationIdRef.current) {
          cancelAnimationFrame(animationIdRef.current);
          animationIdRef.current = null;
        }
        window.removeEventListener("resize", updateSize);
        if (renderer) {
          try {
            const loseCtx = renderer.gl.getExtension("WEBGL_lose_context");
            if (loseCtx) loseCtx.loseContext();
            const canvas = renderer.gl.canvas;
            if (canvas && canvas.parentNode)
              canvas.parentNode.removeChild(canvas);
          } catch (e) {}
        }
        rendererRef.current = null;
        uniformsRef.current = null;
        meshRef.current = null;
      };
    };

    initializeWebGL();

    return () => {
      if (cleanupFunctionRef.current) {
        cleanupFunctionRef.current();
        cleanupFunctionRef.current = null;
      }
    };
    // only run once on mount/unmount
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (!uniformsRef.current) return;
    const u = uniformsRef.current;
    u.iSpeed.value = speed;
    u.iRayColor1.value = hexToRgb(rayColor1);
    u.iRayColor2.value = hexToRgb(rayColor2);
    u.iIntensity.value = intensity;
    u.iSpread.value = spread;
    const [flipX, flipY] = originToFlip(origin);
    u.iFlipX.value = flipX;
    u.iFlipY.value = flipY;
    u.iTilt.value = tilt;
    u.iSaturation.value = saturation;
    u.iBlend.value = blend;
    u.iFalloff.value = falloff;
    u.iOpacity.value = opacity;
  }, [
    speed,
    rayColor1,
    rayColor2,
    intensity,
    spread,
    origin,
    tilt,
    saturation,
    blend,
    falloff,
    opacity,
  ]);

  return (
    <div
      ref={containerRef}
      className={`absolute top-0 left-0 w-full h-[340px] md:h-[480px] pointer-events-none select-none z-10 ${className}`.trim()}
      style={style}
      aria-hidden="true"
    />
  );
};

// Single export default at file end, so do not export this

const projects = [
  {
    id: 1,
    title: "Sundown Studio",
    description:
      "Animated frontend website using GSAP for interactive web design.",
    tech: ["HTML", "CSS", "Javascript", "GSAP", "locomotive.js"],
    url: "https://vikash11995.github.io/Sundown-FrontEnd/",
  },
  {
    id: 2,
    title: "FreshCart Frontend",
    description: "Groceries site: simple layout, navigation, easy listings.",
    tech: ["React", "Tailwind", "React-Router"],
    url: "https://fresh-cart-omega-three.vercel.app/",
  },
  {
    id: 3,
    title: "WebSeeder Courier",
    description:
      "A courier project with the seamless layout and shortcut key to search any page ",
    tech: ["React", "Tailwind", "Javascript", "React-Router"],
    url: "https://courier-sooty.vercel.app/",
  },
];

export default function WebDeveloperPortfolio() {
  // Block x-axis scroll for the page (body)
  useEffect(() => {
    const prevOverflowX = document.body.style.overflowX;
    document.body.style.overflowX = "hidden";
    return () => {
      document.body.style.overflowX = prevOverflowX;
    };
  }, []);

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 text-slate-100 antialiased overflow-y-auto no-scrollbar relative"
      style={{ overflowX: "hidden" }}
    >
      {/* Side rays animation background at top */}
      <SideRays
        speed={2}
        rayColor1="#EAB308"
        rayColor2="#38bdf8"
        intensity={2.1}
        spread={2.8}
        origin="top-right"
        tilt={-13}
        saturation={1.8}
        blend={0.67}
        falloff={1.62}
        opacity={1.0}
        className="pointer-events-none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100vw",
          height: "400px",
          zIndex: 1,
        }}
      />
      <header className="max-w-2xl mx-auto md:mt-8 px-8 p-2.5 md:py-4 flex items-center justify-between relative z-[10] md:bg-linear-to-r from-slate-900/80 via-slate-800/80 to-slate-700/80 md:shadow-xl md:rounded-2xl border border-slate-600/30 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <span className="text-xl font-bold tracking-tight text-emerald-300 drop-shadow-sm">
            Vikash Yadav
          </span>
        </div>
        <MobileNav />
      </header>

      <main className="max-w-6xl mx-auto px-6  relative z-[2]">
        <section className="flex flex-col md:flex-row gap-8 items-center justify-between">
          <div>
            <p className="text-emerald-300 font-medium mb-2">
              Hi, I build delightful web experiences
            </p>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              I'm a Frontend Web Developer focused on performance & motion
            </h1>
            <p className="mt-6 text-slate-300">
              I design and build responsive, accessible web apps using modern
              tools. I love adding polish through animations and
              micro-interactions.
            </p>

            <div className="mt-8 flex gap-4">
              <a
                href="#projects"
                className="inline-block bg-emerald-400 text-slate-900 px-5 py-2 rounded-md font-semibold shadow-lg"
              >
                See projects
              </a>
              <a
                href="#contact"
                className="inline-block border border-slate-500 px-5 py-2 rounded-md"
              >
                Contact
              </a>
            </div>

            <div className="mt-8 w-full">
              <h4 className="text-sm text-slate-400 mb-2">Skills</h4>
              <div className="overflow-x-hidden relative h-8">
                <div
                  className="absolute left-0 top-0 whitespace-nowrap flex gap-3"
                  style={{
                    animation: "marquee 22s linear infinite",
                  }}
                >
                  {[
                    "#React",
                    "#HTML",
                    "#CSS",
                    "#Tailwind",
                    "#JavaScript",
                    "#Redux",
                    "#Bootstrap",
                    "#GSAP",
                    "#locomotive.js",
                    "#React",
                    "#HTML",
                    "#CSS",
                    "#Tailwind",
                    "#JavaScript",
                    "#Redux",
                    "#Bootstrap",
                    "#GSAP",
                    "#locomotive.js",
                    "#React",
                    "#HTML",
                    "#CSS",
                    "#Tailwind",
                    "#JavaScript",
                    "#Redux",
                    "#Bootstrap",
                    "#GSAP",
                    "#locomotive.js",
                    "#React",
                    "#HTML",
                    "#CSS",
                    "#Tailwind",
                    "#JavaScript",
                    "#Redux",
                    "#Bootstrap",
                    "#GSAP",
                    "#locomotive.js",
                  ].map((s, i) => (
                    <span
                      key={s + i}
                      className="text-xs px-2 py-1 bg-white/5 rounded"
                    >
                      {s}
                    </span>
                  ))}
                </div>
                <style>
                  {`
                    @keyframes marquee {
                      0% { transform: translateX(0); }
                      100% { transform: translateX(-50%); }
                    }
                  `}
                </style>
              </div>
            </div>
          </div>

          <div className=" w-[50%]  hidden lg:block ">
            
            <div
              className=" relative right-0 flex  w-[40vw] h-[600px]  p-4 "
            
            >
              <Orb
                hoverIntensity={2}
                rotateOnHover={true}
                hue={0}
                forceHoverState={false}
                backgroundColor="#000000"
                className="w-auto h-auto overflow-auto"
              />
            </div>
          </div>
   
        </section>
 

        <section id="projects" className="mt-20">
          <h2 className="text-2xl font-bold mb-6">Selected projects</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {projects.map((p) => (
              <article
                key={p.id}
                className="bg-white/5 p-5 rounded-xl backdrop-blur-sm border border-white/5"
              >
                <h3 className="font-semibold text-lg">{p.title}</h3>
                <p className="text-sm text-slate-300 mt-2">{p.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {p.tech.map((t) => (
                    <span
                      key={t}
                      className="text-xs px-2 py-1 bg-white/6 rounded"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-4">
                  <a
                    href={p.url}
                    className="inline-block text-sm border-b-slate-300 hover:border-b-1 pb-0.5"
                  >
                    View project
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="about mt-20 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="text-2xl font-bold">About me</h2>
            <p className="mt-4 text-slate-300">
              I care about performance, accessibility and delivering delightful
              user experiences.
            </p>
            <ul className="mt-4 list-disc ml-5 text-slate-300">
              <li>Frontend architecture & component-driven design</li>
              <li>Animating interfaces for better UX</li>
              <li>Optimizing bundle size and Lighthouse metrics</li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm text-slate-400">Contact</h4>
            <div id="contact" className="mt-3">
              <p className="text-slate-300">
                Email:{" "}
                <a
                  className=" hover:text-emerald-300"
                  href="mailto:vikashyadav11995@gmail.com"
                >
                  vikashyadav11995@gmail.com
                </a>
              </p>
              <p className="text-slate-300 mt-2">Location: India</p>
              <div className="mt-4">
                <a
                  href="https://drive.google.com/file/d/1UqXrWlTsvV_kyZdBKGnieFGDa2f9VbFT/view?usp=drive_link"
                  className="inline-block px-4 py-2 border rounded hover:bg-emerald-500"
                >
                  Download resume
                </a>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-20 py-12 text-center text-sm text-slate-400">
          © {new Date().getFullYear()} Vikash Yadav — Built with React &
          Tailwind
        </footer>
      </main>
    </div>
  );
}

// Hamburger Navbar Component (moved out of JSX return)
function MobileNav() {
  const [open, setOpen] = useState(false);

  // Define menuItems and socialItems outside JSX expressions
  const menuItems = [
    { label: 'Home', ariaLabel: 'Go to home page', link: '/' },
    { label: 'About', ariaLabel: 'Learn about us', link: '/about' },
    { label: 'Services', ariaLabel: 'View our services', link: '/services' },
    { label: 'Contact', ariaLabel: 'Get in touch', link: '/contact' }
  ];

  const socialItems = [
    { label: 'Twitter', link: 'https://twitter.com' },
    { label: 'GitHub', link: 'https://github.com' },
    { label: 'LinkedIn', link: 'https://linkedin.com' }
  ];

  return (
    <>
      {/* Desktop Nav */}
      <nav className="space-x-10 mr-10 text-sm  hidden md:flex text-[16px] ">
        <a
          className="hover:opacity-80 hover:text-green-600 cursor-pointer"
          href="/"
        >
          Home
        </a>
        <a
          className="hover:opacity-80 hover:text-green-600  cursor-pointer"
          href="#projects"
        >
          Projects
        </a>
        <a
          className="hover:opacity-80 hover:text-green-600  cursor-pointer"
          href="#contact"
        >
          About
        </a>
        <a
          className="hover:opacity-80  hover:text-green-600 cursor-pointer"
          href="#contact"
        >
          Contact
        </a>
      </nav>
      {/* Mobile Hamburger */}
   <div className="md:hidden relative flex justify-center">
        <button
          className="flex flex-col justify-center items-center w-8 h-8 focus:outline-none"
          aria-label="Open navigation menu"
          onClick={() => setOpen((o) => !o)}
        >
          <span
            className={`block h-0.5 w-6 bg-slate-100 transition-all duration-300 ${
              open ? "rotate-45 translate-y-1.5" : ""
            }`}
          />
          <span
            className={`block h-0.5 w-6 bg-slate-100 my-1 transition-all duration-300 ${
              open ? "opacity-0" : ""
            }`}
          />
          <span
            className={`block h-0.5 w-6 bg-slate-100 transition-all duration-300 ${
              open ? "-rotate-45 -translate-y-1.5" : ""
            }`}
          />
        </button>
        {/* Mobile Nav Dropdown */}
        {open && (
          <div
            className={
              "absolute   items-center mt-11  -left-74 w-90  bg-linear-to-r from-slate-900/90  to-slate-900/90 rounded shadow-lg py-2 z-50 flex rounded-b-2xl flex-col  bg-white" +
              "transform transition-all duration-300 ease-out " +
              (open
                ? "opacity-100 max-h-[500px] scale-y-100"
                : "opacity-0 max-h-0 scale-y-95 pointer-events-none")
            }
            style={{
              transformOrigin: "top",
              transitionProperty: "opacity,max-height,transform",
            }}
          >
            <a
              className="px-4 py-2 hover:bg-slate-700 cursor-pointer"
              onClick={() => setOpen(false)}
              href="/"
            >
              Home
            </a>
            <a
              className="px-4 py-2 hover:bg-slate-700 cursor-pointer"
              onClick={() => setOpen(false)}
              href="#projects"
            >
              Projects
            </a>
            <a
              className="px-4 py-2 hover:bg-slate-700 cursor-pointer"
              onClick={() => setOpen(false)}
              href="#contact"
            >
              About
            </a>
            <a
              className="px-4 py-2 hover:bg-slate-700 cursor-pointer"
              onClick={() => setOpen(false)}
              href="#contact"
            >
              Contact
            </a>
          </div>
          )}
          </div>
    </>
  );
}
