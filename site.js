// shared by every page: footer year, and sections easing in once as you scroll to them
document.getElementById("yr").textContent=new Date().getFullYear();

if("IntersectionObserver"in window&&!matchMedia("(prefers-reduced-motion:reduce)").matches){
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}}),{rootMargin:"0px 0px -8% 0px"});
  document.querySelectorAll("main section .wrap>*").forEach(el=>{el.classList.add("reveal");io.observe(el)});
}
