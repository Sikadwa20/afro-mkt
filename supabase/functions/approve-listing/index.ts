import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { decode as decodePng } from "npm:fast-png@8.0.0";
import jpeg from "npm:jpeg-js@0.4.4";
import { verifiedUser } from "../_shared/auth.ts";

const cors = {
  "Access-Control-Allow-Origin": "https://afro-mkt.com",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function reply(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "Use POST." }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const user = await verifiedUser(req, admin);
    if (!user?.email) return reply({ error: "Sign in to check your listing." }, 401);
    const { product_id } = await req.json();
    if (typeof product_id !== "string" || !/^[0-9a-f-]{36}$/i.test(product_id)) return reply({ error: "Invalid listing." }, 400);
    const { data: product, error } = await admin.from("products")
      .select("id,seller_email,name,description,image_url,product_images,is_active,seller_id")
      .eq("id", product_id).eq("seller_email", user.email.toLowerCase()).maybeSingle();
    if (error) throw error;
    if (!product) return reply({ error: "Listing not found." }, 404);
    const description = (product.description || "").trim();
    if (description.length < 80 || description.length > 1000 || description.split(/\s+/u).length < 12)
      return reply({ error: "Describe the product in at least 80 characters and 12 words, including its size, materials or ingredients and intended use." }, 422);
    const prefix = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/product-images/${user.id}/`;
    if (typeof product.image_url !== "string" || !product.image_url.startsWith(prefix))
      return reply({ error: "Upload a product photo through your seller dashboard." }, 422);
    const gallery = product.product_images || [];
    if (!Array.isArray(gallery) || gallery.length > 4) return reply({ error: "Choose up to five photos and videos combined." }, 422);
    const files = [product.image_url, ...gallery];
    for (let index = 0; index < files.length; index++) {
      const url = files[index];
      if (typeof url !== "string" || !url.startsWith(prefix)) return reply({ error: "Upload files through your own seller dashboard." }, 422);
      const file = url.slice(prefix.length);
      const match = file.match(/^[A-Za-z0-9_.-]+\.(png|jpg|jpeg|mp4|webm)$/i);
      if (!match) return reply({ error: "Upload this file again using your dashboard." }, 422);
      const extension = match[1].toLowerCase();
      const video = extension === "mp4" || extension === "webm";
      if (index === 0 && video) return reply({ error: "The first file must be a cover photo." }, 422);
      const { data: blob, error: downloadError } = await admin.storage.from("product-images").download(`${user.id}/${file}`);
      if (downloadError || !blob || !blob.size || blob.size > (video ? 20 : 5) * 1024 * 1024)
        return reply({ error: video ? "Video is unavailable or larger than 20 MB." : "Photo is unavailable or larger than 5 MB." }, 422);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (video) {
        const mp4 = bytes.length >= 24 && bytes[4] === 102 && bytes[5] === 116 && bytes[6] === 121 && bytes[7] === 112;
        const webm = bytes.length >= 32 && bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163 && new TextDecoder().decode(bytes.slice(0,4096)).includes("webm");
        if (extension === "mp4" ? !mp4 : !webm) return reply({ error: "Video format is invalid. Upload a playable MP4 or WebM video." }, 422);
        continue;
      }
      let decoded;
      try {
        if (extension === "png") {
          const png = [137,80,78,71,13,10,26,10];
          if (bytes.length < 33 || !png.every((value,i) => bytes[i] === value)) throw Error("Invalid PNG");
          const header = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
          const width = header.getUint32(16), height = header.getUint32(20);
          if (width < 800 || height < 800 || width > 4096 || height > 4096) throw Error("Photo dimensions");
          decoded = decodePng(bytes,{ checkCrc:true });
          if (decoded.width !== width || decoded.height !== height) throw Error("Invalid pixels");
        } else {
          // Support the JPEG photos already uploaded by existing sellers.
          if (bytes[0] !== 255 || bytes[1] !== 216) throw Error("Invalid JPEG");
          decoded = jpeg.decode(bytes,{ useTArray:true, maxResolutionInMP:16, maxMemoryUsageInMB:256 });
        }
        if (decoded.width < 800 || decoded.height < 800 || decoded.width > 4096 || decoded.height > 4096) throw Error("Photo dimensions");
      } catch { return reply({ error: "Photo cannot be verified. Choose a clear photo at least 800 × 800 pixels and upload it again." }, 422); }
    }
    const { data: approved, error: approvalError } = await admin.rpc("approve_seller_listing", {
      listing_id: product.id, seller_id: user.id, seller: user.email.toLowerCase(),
      expected_description: product.description, expected_image: product.image_url, expected_gallery: gallery,
    });
    if (approvalError) throw approvalError;
    if (!approved) return reply({ error: "An active plan is required. If the listing changed, try checking it again." }, 409);
    return reply({ approved: true });
  } catch (error) {
    console.error("Listing check failed", error instanceof Error ? error.message : "Unknown error");
    return reply({ error: "The listing check could not finish. Your listing remains pending; please try again." }, 500);
  }
});
