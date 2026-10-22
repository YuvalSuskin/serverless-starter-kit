// next/image's loader (D4): images never go through Next's optimiser, so the
// URL an <Image> is given is the URL the browser loads. A project that serves
// images in several sizes makes them itself (at upload, say) and serves them
// under /media/*.
export default function imageLoader({ src }: Readonly<{ src: string; width: number }>): string {
  return src;
}
