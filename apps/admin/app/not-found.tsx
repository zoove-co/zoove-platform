import { RestDay } from '@/components/RestDay';

export default function NotFound() {
  return (
    <RestDay title="Nothing here, it's a rest day" actions={<a className="btn" href="/">Back to the panel</a>}>
      We could not find that page. It may have moved, or the link is not quite right.
    </RestDay>
  );
}
