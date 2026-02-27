import bowlImage from "../assets/bowl-illustration.png";

export default function BowlIllustration({ className = "" }) {
  return (
    <img
      src={bowlImage}
      alt=""
      aria-hidden="true"
      className={`${className} object-contain`}
    />
  );
}
