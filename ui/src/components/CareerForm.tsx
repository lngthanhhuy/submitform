import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { useEffect } from "react"
import { supabase } from "@/config/supabaseClient"

const CareerForm = () => {
  useEffect(() => {
    const testConnection = async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("*")

      if (error) {
        console.error("Kết nối thất bại:", error)
        return
      }

      console.log("Kết nối thành công:", data)
    }

    testConnection()
  }, [])

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      className="border border-border bg-background p-6 shadow-sm sm:p-10"
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col items-center text-center gap-2">
          <a href="/"
            className="mx-auto block w-fit text-center"
          ></a>
          <h1 className="text-2xl font-bold">Form ứng tuyển</h1>
          <p className="text-muted-foreground text-balance">
            Chào mừng bạn! Điền thông tin bên dưới để bắt đầu!
          </p>
        </div>
        {/* full name */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="lastname" className="block text-sm">
              Họ
            </Label>
            <Input
              type="text"
              id="lastname"
            />
            {/* error message */}
          </div>
          <div className="space-y-2">
            <Label htmlFor="firstname" className="block text-sm">
              Tên
            </Label>
            <Input
              type="text"
              id="firstname"
            />
            {/* error message */}
          </div>
        </div>
        {/* email */}
        <div className="flex flex-col gap-3">
          <Label htmlFor="email" className="block text-sm">
            Email
          </Label>
          <Input
            type="email"
            id="email"
            placeholder="huy@gmail.com"
          />
          {/* error message */}
        </div>
        {/* vị trí ứng tuyển */}
        <div className="flex flex-col gap-3">
          <Label htmlFor="vi-tri" className="block text-sm">
            Vị trí ứng tuyển
          </Label>
          <Select name="position">
            <SelectTrigger id="vi-tri" className="w-full">
              <SelectValue placeholder="Chọn ví trí ứng tuyển" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="dev-intern">
                Intern Developer
              </SelectItem>
              <SelectItem value="designer-intern">
                Intern Designer
              </SelectItem>
            </SelectContent>
          </Select>
          {/* error message */}
        </div>
        {/* CV */}
        <div className="flex flex-col gap-3">
          <Label htmlFor="cv" className="block text-sm">
            CV đính kèm
          </Label>
          <Input
            type="file"
            id="cv"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required className="h-auto cursor-pointer"
          />  
          {/* error message */}
        </div>
        {/* Cover letter */}
        <div className="flex flex-col gap-3">
          <Label htmlFor="cover-letter" className="block text-sm">
            Cover letter
          </Label>
          <Input
            type="text"
            id="email"
            placeholder="Thư giới thiệu bản thân (tối đa 1000 ký tự)..."
            maxLength={1000}
          />
          {/* error message */}
        </div>
        {/* submit */}
        <Button
          type="submit"
          className="w-full"
        >
          Gửi đơn ứng tuyển 
        </Button>
      </div>
    </form>
  )
}


export default CareerForm
