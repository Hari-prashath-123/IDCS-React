import { Link, useLocation } from "react-router-dom";
import {
  Facebook,
  Instagram,
  Linkedin,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Suspense, lazy, useState, useEffect } from "react";
import krctLogo from "@/assets/logo1.png";
import { supabase } from "../lib/supabase";

// Lazy-load Spline renderer to keep bundle small
const Spline = lazy(() => import("@splinetool/react-spline"));

interface SplineSceneProps {
  scene: string;
  className?: string;
}

function SplineScene({ scene, className }: SplineSceneProps) {
  return (
    <Suspense
      fallback={
        <div className="w-full h-full flex items-center justify-center">
          <span className="loader"></span>
        </div>
      }
    >
      {/* @ts-ignore - dynamic import of third-party lib */}
      <Spline scene={scene} className={className} />
    </Suspense>
  );
}

// Simple Header adapted from provided Index header
function Header() {
  const location = useLocation();
  const isAuthPage = location.pathname === "/login";
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur shadow-sm">
      <div className="max-w-7xl mx-auto flex justify-between items-center px-4 sm:px-6 lg:px-8 py-3">
        {/* Left Section: Logo */}
        <div className="flex items-center gap-3">
          <img src={krctLogo} alt="KRCT Logo" className="h-12 sm:h-16 w-auto" />
        </div>
        {/* Center Section: College Name */}
        <div className="hidden md:block text-center">
          <div className="text-2xl lg:text-3xl xl:text-4xl font-bold text-blue-600">
            K.Ramakrishnan College of Technology
          </div>
          <div className="text-base lg:text-xl xl:text-2xl font-semibold text-red-600">
            Autonomous
          </div>
        </div>
        {/* Right Section: Login/Home Button */}
        <div>
          {isAuthPage ? (
            <Link
              to="/"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Home
            </Link>
          ) : (
            <Link
              to="/login"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

// This file now contains the original Notice Board Home page plus
// adapted HeroSection, FeaturesSection and CTASection taken from
// the Index.tsx content. To avoid introducing new external UI
// component imports, the sections have been adapted to plain JSX
// using existing Tailwind classes already used in the project.

// Image carousel data - Only notice user content is displayed
// No fallback images - only notice user uploaded content appears here

function HeroSection() {
  console.log("HeroSection component mounted");
  const [noticeImages, setNoticeImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    console.log("useEffect triggered, supabase client:", !!supabase);
    console.log("Environment check:", {
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY
        ? "present"
        : "missing",
    });
    const fetchNoticeImages = async () => {
      try {
        setLoading(true);

        // Fetch content from notice_content table
        const { data: contentData, error: contentError } = await supabase
          .from("notice_content")
          .select("*")
          .order("created_at", { ascending: false });

        console.log("Supabase query result:", { contentData, contentError });

        if (contentError) {
          console.error("Error fetching notice content:", contentError);
          return;
        }

        // Get public URLs for images
        const imagesWithUrls = contentData.map((content) => {
          const { data: publicUrl } = supabase.storage
            .from("notice")
            .getPublicUrl(content.image_name);

          return {
            ...content,
            publicUrl: publicUrl.publicUrl,
            content: content,
          };
        });

        setNoticeImages(imagesWithUrls);

        // Debug logging
        console.log("Direct fetch results:", {
          contentCount: contentData.length,
          imagesWithUrls: imagesWithUrls.map((img) => ({
            name: img.image_name,
            hasContent: !!img.content,
            content: img.content,
            publicUrl: img.publicUrl,
          })),
        });
      } catch (err) {
        console.error("Error in fetchNoticeImages:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchNoticeImages();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => setIsLargeScreen((e as any).matches);
    setIsLargeScreen(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange as any);
    else mq.addListener(onChange as any);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange as any);
      else mq.removeListener(onChange as any);
    };
  }, []);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<any>(null);

  // Only use notice images - no fallback to default images
  const carouselImages = noticeImages.map((img, index) => ({
    src: img.publicUrl,
    alt: `Notice Image ${index + 1}`,
    aspectRatio: "16/9",
    title: img.content?.title || `Notice ${index + 1}`,
    description:
      img.content?.description || "Latest updates and announcements from KRCT.",
    link: img.content?.link,
    linkText: img.content?.link_text,
  }));

  useEffect(() => {
    if (isPaused || carouselImages.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => {
        if (prevIndex === carouselImages.length - 1) {
          return 0;
        }
        return prevIndex + 1;
      });
    }, 3000); // Change image every 3 seconds

    return () => clearInterval(interval);
  }, [isPaused, carouselImages.length]);

  const handleClick = () => {
    const currentNotice = carouselImages[currentIndex];
    setSelectedNotice(currentNotice);
    setShowModal(true);
  };

  const handlePrevious = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prevIndex) => {
      if (prevIndex === 0) {
        return carouselImages.length - 1;
      }
      return prevIndex - 1;
    });
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prevIndex) => {
      if (prevIndex === carouselImages.length - 1) {
        return 0;
      }
      return prevIndex + 1;
    });
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center bg-white py-12 mt-[-1.5cm] sm:mt-0">
      <div className="max-w-[1400px] w-full px-6">
        {/* Mobile college name above carousel */}
        <div className="block lg:hidden text-center mb-4">
          <div className="text-xl font-bold text-blue-600 leading-tight">
            K.Ramakrishnan College of Technology
          </div>
          <div className="text-base font-semibold text-red-600">Autonomous</div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Left side: Auto carousel with dynamic aspect ratio */}
          <div className="flex flex-col items-center justify-center w-full gap-6">
            {loading ? (
              <div
                className="relative overflow-hidden rounded-lg shadow-lg w-full flex items-center justify-center"
                style={{
                  maxWidth: "1284px",
                  aspectRatio: "16/9",
                  minHeight: "200px",
                }}
              >
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-slate-600">Loading images...</p>
                </div>
              </div>
            ) : carouselImages.length === 0 ? (
              <div
                className="relative overflow-hidden rounded-lg shadow-lg w-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100"
                style={{
                  maxWidth: "1284px",
                  aspectRatio: "16/9",
                  minHeight: "400px",
                }}
              >
                <div className="text-center p-8">
                  <div className="text-6xl mb-4">🏛️</div>
                  <h2 className="text-2xl md:text-3xl font-bold text-blue-600 mb-4">
                    K.Ramakrishnan College of Technology
                  </h2>
                  <p className="text-base md:text-lg text-gray-700 mb-6">
                    Shaping tomorrow's engineers and leaders through excellence
                    in education and innovation.
                  </p>
                  <div className="text-sm text-slate-500">
                    Notice board content will appear here when uploaded by
                    administrators.
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div
                  className="relative overflow-hidden rounded-lg shadow-lg cursor-pointer w-full"
                  style={{ maxWidth: "1284px", aspectRatio: "16/9" }}
                  onClick={handleClick}
                >
                  <div
                    className="flex h-full transition-transform duration-700 ease-in-out"
                    style={{
                      transform: `translateX(-${currentIndex * 100}%)`,
                    }}
                  >
                    {/* Render images with duplicates for seamless loop */}
                    {[...carouselImages, ...carouselImages].map(
                      (image, index) => (
                        <div
                          key={index}
                          className="min-w-full h-full flex-shrink-0 relative"
                        >
                          <img
                            src={image.src}
                            alt={image.alt}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              console.error("Image failed to load:", image.src);
                              e.currentTarget.style.display = "none";
                            }}
                            onLoad={() => {
                              console.log(
                                "Image loaded successfully:",
                                image.src
                              );
                            }}
                          />
                          {/* Link button overlay in bottom-right corner - only show when available */}
                          {image.link && image.linkText && (
                            <a
                              href={image.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="absolute bottom-4 right-4 z-30 bg-blue-600/80 hover:bg-blue-700/90 text-white px-4 py-2 rounded-lg transition-all duration-300 backdrop-blur-sm border border-blue-400/50 shadow-lg"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {image.linkText}
                            </a>
                          )}
                        </div>
                      )
                    )}
                  </div>

                  {/* Navigation arrows - only show if more than 1 image */}
                  {carouselImages.length > 1 && (
                    <>
                      <button
                        onClick={handlePrevious}
                        className="absolute left-4 top-1/2 transform -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-all"
                        aria-label="Previous image"
                      >
                        <ChevronLeft className="w-6 h-6" />
                      </button>
                      <button
                        onClick={handleNext}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-all"
                        aria-label="Next image"
                      >
                        <ChevronRight className="w-6 h-6" />
                      </button>
                    </>
                  )}
                </div>

                {/* Text container that moves with images - only show if there are images */}
                {carouselImages.length > 0 && (
                  <div
                    className="relative w-full overflow-hidden min-h-[120px]"
                    style={{ maxWidth: "1284px" }}
                  >
                    <div
                      className="flex transition-transform duration-700 ease-in-out"
                      style={{
                        transform: `translateX(-${currentIndex * 100}%)`,
                      }}
                    >
                      {[...carouselImages, ...carouselImages].map(
                        (image, index) => (
                          <div
                            key={index}
                            className="w-full flex-shrink-0 px-4 overflow-hidden"
                          >
                            <h2 className="text-2xl md:text-3xl font-bold text-blue-600 mb-2 break-words w-full">
                              {image.title}
                            </h2>
                            <p className="text-base md:text-lg text-gray-700 break-words whitespace-normal w-full mb-3">
                              {image.description}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 3D Scene (Spline) - Hidden on mobile, visible on desktop */}
          <div
            className="hidden lg:block relative z-10"
            style={{ height: "720px" }}
          >
            <SplineScene
              scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
              className="w-full h-full"
            />
          </div>
        </div>
      </div>

      {/* Modal for notice details */}
      {showModal && selectedNotice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between rounded-t-xl">
              <h2 className="text-lg font-bold text-blue-600">
                Notice Details
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4">
              {/* Notice Image */}
              <div className="mb-4 rounded-lg overflow-hidden shadow-lg">
                <img
                  src={selectedNotice.src}
                  alt={selectedNotice.alt}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-auto object-contain max-h-[400px]"
                />
              </div>

              {/* Notice Title */}
              <h3 className="text-xl font-bold text-slate-800 mb-3">
                {selectedNotice.title}
              </h3>

              {/* Notice Description */}
              <div className="prose prose-slate max-w-none mb-4">
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {selectedNotice.description}
                </p>
              </div>

              {/* Notice Link */}
              {selectedNotice.link && selectedNotice.linkText && (
                <div className="flex justify-center mt-4">
                  <a
                    href={selectedNotice.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm rounded-lg transition-all duration-300 shadow-md hover:shadow-lg transform hover:scale-105"
                  >
                    {selectedNotice.linkText}
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-4 py-3 flex justify-end rounded-b-xl">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* CTASection removed per user request */

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col pt-16">
      <Header />
      {/* Hero section adapted from Index.tsx */}
      <HeroSection />

      <footer className="relative bg-blue-600 text-white pt-20 pb-12 px-4 sm:px-6 lg:px-8">
        {/* Wave SVG */}
        <div
          className="absolute top-0 left-0 w-full overflow-hidden leading-none"
          style={{ transform: "translateY(-1px)" }}
        >
          <svg
            className="relative block w-full h-[80px] md:h-[120px]"
            data-name="Layer 1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 1200 120"
            preserveAspectRatio="none"
          >
            <path
              d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"
              className="fill-white"
            ></path>
          </svg>
        </div>

        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
          {/* Column 1: Contact Us */}
          <div>
            <h3 className="text-lg font-semibold text-primary-foreground mb-4">
              Contact Us
            </h3>
            <p
              className="text-sm leading-relaxed"
              dangerouslySetInnerHTML={{
                __html:
                  "K.Ramakrishnan College of Technology<br>Samayapuram, Trichy - 621 112<br>Tamil Nadu, India",
              }}
            />
            <p>
              <strong>Phone:</strong> +91 431 2648601
            </p>
            <p>
              <strong>Email:</strong> idcs@krct.ac.in
            </p>
          </div>
          {/* Column 2: Follow Us */}
          <div>
            <h3 className="text-lg font-semibold text-primary-foreground mb-4">
              Follow Us
            </h3>
            <div className="flex gap-4 mt-4">
              <a
                href="https://www.facebook.com/krctofficial"
                target="_blank"
                rel="noopener noreferrer"
                className="group w-10 h-10 rounded-full bg-white/10 text-white/80 flex items-center justify-center transition-all duration-200 ease-out hover:bg-white/20 hover:scale-110 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                aria-label="Facebook"
                title="Facebook"
              >
                <Facebook className="h-5 w-5 text-white/90 transition-transform duration-200 group-hover:-translate-y-0.5" />
              </a>
              <a
                href="https://x.com/krcttrichy1"
                target="_blank"
                rel="noopener noreferrer"
                className="group w-10 h-10 rounded-full bg-white/10 text-white/80 flex items-center justify-center transition-all duration-200 ease-out hover:bg-white/20 hover:scale-110 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                aria-label="X (Twitter)"
                title="X (Twitter)"
              >
                <X className="h-5 w-5 text-white/90 transition-transform duration-200 group-hover:-translate-y-0.5" />
              </a>
              <a
                href="https://www.instagram.com/krctofficial/"
                target="_blank"
                rel="noopener noreferrer"
                className="group w-10 h-10 rounded-full bg-white/10 text-white/80 flex items-center justify-center transition-all duration-200 ease-out hover:bg-white/20 hover:scale-110 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                aria-label="Instagram"
                title="Instagram"
              >
                <Instagram className="h-5 w-5 text-white/90 transition-transform duration-200 group-hover:-translate-y-0.5" />
              </a>
              <a
                href="https://www.linkedin.com/school/krctofficial/posts/?feedView=all"
                target="_blank"
                rel="noopener noreferrer"
                className="group w-10 h-10 rounded-full bg-white/10 text-white/80 flex items-center justify-center transition-all duration-200 ease-out hover:bg-white/20 hover:scale-110 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                aria-label="Linkedin"
                title="LinkedIn"
              >
                <Linkedin className="h-5 w-5 text-white/90 transition-transform duration-200 group-hover:-translate-y-0.5" />
              </a>
            </div>
          </div>
        </div>
        {/* Bottom Bar */}
        <div className="mt-10 pt-6 border-t border-background/20 text-center text-sm">
          <p>
            © {new Date().getFullYear()} K.Ramakrishnan College of Technology.
            All Rights Reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
