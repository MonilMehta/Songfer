import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'

interface SongCardProps {
  title: string
  artist: string
  coverUrl: string
  onPlay: () => void
}

export default function SongCard({ title, artist, coverUrl, onPlay }: SongCardProps) {
  return (
    <Card className="w-full">
      <CardContent className="p-4">
        <div className="aspect-square relative mb-4">
          <Image
            src={coverUrl}
            alt={`${title} by ${artist}`}
            layout="fill"
            objectFit="cover"
            className="rounded-md"
          />
        </div>
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="text-muted-foreground">{artist}</p>
      </CardContent>
      <CardFooter>
        <Button onClick={onPlay} className="w-full">
          Play
        </Button>
      </CardFooter>
    </Card>
  )
}

