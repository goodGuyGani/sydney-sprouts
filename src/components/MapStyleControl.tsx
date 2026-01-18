import { MapPin } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { mapStyles, type MapStyle } from './MapStyleSelector'

interface MapStyleControlProps {
  value: MapStyle
  onValueChange: (value: MapStyle) => void
  className?: string
}

export function MapStyleControl({ value, onValueChange, className }: MapStyleControlProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className} size="sm">
        <MapPin className="size-4" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-[1001] !text-foreground">
        {mapStyles.map((style) => (
          <SelectItem key={style.value} value={style.value} className="!text-foreground">
            {style.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
