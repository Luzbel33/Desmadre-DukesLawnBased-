"""Paint donor base-skin colors onto dancer bodies while retaining their boots and hair.

The donor GLBs are clean MakeHuman body references with matching body UVs and
vertex order. This keeps the club rig, eyes, hair, and accessories in place.
"""
import io
import json
import pathlib
import struct

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[3]
GAME = ROOT / "public/assets/chars/npc"
DONORS = ROOT / "assets/blender/mh/base-skin"
BODY_VERTICES = 14517
HEAD = {"head", "jaw", "eye_l", "eye_r", "neck"}
BOOT_TOP = {
    "lilith": ("lowerleg_l", 0.12),
    "coneja": ("foot_l", 0.10),
    "venus": ("lowerleg_l", -0.05),
    "raven": ("foot_l", 0.12),
    "emo": ("foot_l", 0.13),
}


def read_glb(path):
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise ValueError(f"No es un GLB válido: {path}")
    offset, chunks = 12, []
    while offset < len(data):
        size, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        chunks.append([kind, data[offset:offset + size]])
        offset += size
    doc = json.loads(next(payload for kind, payload in chunks if kind == 0x4E4F534A))
    bin_chunk = next(i for i, (kind, _) in enumerate(chunks) if kind == 0x004E4942)
    return chunks, doc, bin_chunk


def accessor(doc, blob, index):
    acc = doc["accessors"][index]
    view = doc["bufferViews"][acc["bufferView"]]
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
    fmt = {5121: "B", 5123: "H", 5125: "I", 5126: "f"}[acc["componentType"]]
    size = struct.calcsize(fmt)
    stride = view.get("byteStride", width * size)
    offset = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    rows = [struct.unpack_from("<" + fmt * width, blob, offset + i * stride)
            for i in range(acc["count"])]
    if acc.get("normalized"):
        denom = {5121: 255, 5123: 65535, 5125: 4294967295}.get(acc["componentType"], 1)
        rows = [tuple(v / denom for v in row) for row in rows]
    return [row[0] for row in rows] if width == 1 else rows


def rotate(q, v):
    x, y, z, w = q
    vx, vy, vz = v
    tx, ty, tz = (2 * (y * vz - z * vy), 2 * (z * vx - x * vz), 2 * (x * vy - y * vx))
    return (vx + w * tx + y * tz - z * ty,
            vy + w * ty + z * tx - x * tz,
            vz + w * tz + x * ty - y * tx)


def joint_positions(doc, skin):
    parents = {child: parent for parent, node in enumerate(doc["nodes"])
               for child in node.get("children", [])}

    def world(index):
        chain = []
        while index is not None:
            chain.append(index)
            index = parents.get(index)
        pos, quat, scale = (0., 0., 0.), (0., 0., 0., 1.), (1., 1., 1.)
        for index in reversed(chain):
            node = doc["nodes"][index]
            translation = node.get("translation", (0, 0, 0))
            local_q = node.get("rotation", (0, 0, 0, 1))
            local_s = node.get("scale", (1, 1, 1))
            rotated = rotate(quat, tuple(scale[i] * translation[i] for i in range(3)))
            pos = tuple(pos[i] + rotated[i] for i in range(3))
            quat = (quat[3] * local_q[0] + quat[0] * local_q[3] + quat[1] * local_q[2] - quat[2] * local_q[1],
                    quat[3] * local_q[1] - quat[0] * local_q[2] + quat[1] * local_q[3] + quat[2] * local_q[0],
                    quat[3] * local_q[2] + quat[0] * local_q[1] - quat[1] * local_q[0] + quat[2] * local_q[3],
                    quat[3] * local_q[3] - quat[0] * local_q[0] - quat[1] * local_q[1] - quat[2] * local_q[2])
            scale = tuple(scale[i] * local_s[i] for i in range(3))
        return pos

    return {doc["nodes"][i].get("name"): world(i) for i in skin["joints"]}


def linear_to_srgb(value):
    value = max(0.0, min(1.0, value))
    return 12.92 * value if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055


def paint_triangle(color_draw, mask_draw, uv, colors, width, height):
    # glTF UVs use v=0 at the first image row in the runtime texture sampler.
    points = [(u * (width - 1), v * (height - 1)) for u, v in uv]
    linear = [sum(vertex[channel] for vertex in colors) / 3 for channel in range(3)]
    rgb = tuple(round(linear_to_srgb(value) * 255) for value in linear)
    color_draw.polygon(points, fill=rgb)
    mask_draw.polygon(points, fill=255)


def encode_jpeg(image, quality, subsampling):
    stream = io.BytesIO()
    image.save(stream, format="JPEG", quality=quality, optimize=True, subsampling=subsampling)
    return stream.getvalue()


def process(name):
    target, donor = GAME / f"{name}.glb", DONORS / f"{name}.glb"
    chunks, doc, bin_chunk = read_glb(target)
    if doc.get("extras", {}).get("baseSkinTextureVersion") == 1:
        print(f"{name}: ya tiene la piel base limpia")
        return
    donor_chunks, donor_doc, donor_bin = read_glb(donor)
    blob = bytearray(chunks[bin_chunk][1])
    donor_blob = donor_chunks[donor_bin][1]
    mesh = doc["meshes"][0]["primitives"][0]
    base = donor_doc["meshes"][0]["primitives"][0]
    pos = accessor(doc, blob, mesh["attributes"]["POSITION"])
    uv = accessor(doc, blob, mesh["attributes"]["TEXCOORD_0"])
    joints = accessor(doc, blob, mesh["attributes"]["JOINTS_0"])
    weights = accessor(doc, blob, mesh["attributes"]["WEIGHTS_0"])
    indices = accessor(doc, blob, mesh["indices"])
    donor_uv = accessor(donor_doc, donor_blob, base["attributes"]["TEXCOORD_0"])
    colors = accessor(donor_doc, donor_blob, base["attributes"]["COLOR_0"])
    if len(uv) < BODY_VERTICES or len(colors) != BODY_VERTICES:
        raise ValueError(f"{name}: el cuerpo donor no coincide con la malla del club")
    if any(abs(uv[i][axis] - donor_uv[i][axis]) > 1e-6
           for i in range(BODY_VERTICES) for axis in range(2)):
        raise ValueError(f"{name}: las UV del donor no coinciden con las del NPC del club")
    joint_names = [doc["nodes"][i].get("name", "") for i in doc["skins"][0]["joints"]]
    dominant = [joint_names[ids[max(range(4), key=lambda i: ws[i])]] for ids, ws in zip(joints, weights)]
    bones = joint_positions(doc, doc["skins"][0])
    boot_joint, boot_offset = BOOT_TOP[name]
    boot_top = bones[boot_joint][1] + boot_offset

    def source_image(image_index):
        view = doc["bufferViews"][doc["images"][image_index]["bufferView"]]
        start = view.get("byteOffset", 0)
        end = start + view["byteLength"]
        return Image.open(io.BytesIO(blob[start:end])).convert("RGB")

    color = source_image(0)
    rough = source_image(1)
    skin_mask = Image.new("L", color.size, 0)
    preserve_mask = Image.new("L", color.size, 0)
    color_draw, skin_draw = ImageDraw.Draw(color), ImageDraw.Draw(skin_mask)
    preserve_draw = ImageDraw.Draw(preserve_mask)
    selected, preserved = 0, 0
    for offset in range(0, len(indices), 3):
        tri = indices[offset:offset + 3]
        if len(tri) != 3 or max(tri) >= BODY_VERTICES:
            continue
        polygon = [(uv[i][0] * color.width, uv[i][1] * color.height) for i in tri]
        if sum(dominant[i] not in HEAD for i in tri) < 2:
            preserve_draw.polygon(polygon, fill=255)
            preserved += 1
            continue
        # Preserve the original boot textures and their small geometry offsets.
        if min(pos[i][1] for i in tri) <= boot_top + 0.025:
            preserve_draw.polygon(polygon, fill=255)
            preserved += 1
            continue
        paint_triangle(color_draw, skin_draw, [uv[i] for i in tri], [colors[i] for i in tri], color.width, color.height)
        selected += 1

    # A small edge expansion hides old fabric pixels at UV seams but never
    # overwrites the preserved boot or head islands.
    expanded = skin_mask.filter(ImageFilter.MaxFilter(5))
    fill_mask = ImageChops.subtract(expanded, preserve_mask)
    fringe = ImageChops.subtract(fill_mask, skin_mask)
    if fringe.getbbox():
        color.paste(color.filter(ImageFilter.GaussianBlur(1.0)), mask=fringe)

    rough_mask = skin_mask.filter(ImageFilter.MaxFilter(5)).resize(rough.size, Image.Resampling.LANCZOS).point(lambda value: 255 if value > 8 else 0)
    preserve_rough = preserve_mask.resize(rough.size, Image.Resampling.LANCZOS).point(lambda value: 255 if value > 8 else 0)
    rough_mask = ImageChops.subtract(rough_mask, preserve_rough)
    channels = list(rough.split())
    channels[1].paste(round(0.62 * 255), mask=rough_mask)
    rough = Image.merge("RGB", channels)

    replacements = (encode_jpeg(color, 92, 0), encode_jpeg(rough, 90, 2))
    for image_index, payload in enumerate(replacements):
        blob.extend(bytes((-len(blob)) % 4))
        view_index = len(doc["bufferViews"])
        doc["bufferViews"].append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(payload)})
        doc["images"][image_index]["bufferView"] = view_index
        blob.extend(payload)
    doc["buffers"][0]["byteLength"] = len(blob)
    doc.setdefault("extras", {})["baseSkinTextureVersion"] = 1
    chunks[bin_chunk][1] = bytes(blob)
    json_chunk = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_chunk += b" " * ((-len(json_chunk)) % 4)
    binary_chunk = chunks[bin_chunk][1]
    binary_chunk += b"\0" * ((-len(binary_chunk)) % 4)
    payload = bytearray()
    payload.extend(struct.pack("<II", len(json_chunk), 0x4E4F534A)); payload.extend(json_chunk)
    payload.extend(struct.pack("<II", len(binary_chunk), 0x004E4942)); payload.extend(binary_chunk)
    target.write_bytes(b"glTF" + struct.pack("<II", 2, 12 + len(payload)) + payload)
    print(f"{name}: {selected} triángulos de piel; {preserved} preservados (cara/botas); bota desde y={boot_top:.3f}")


if __name__ == "__main__":
    import sys
    names = sys.argv[1:] or list(BOOT_TOP)
    unknown = set(names) - BOOT_TOP.keys()
    if unknown:
        raise SystemExit(f"Modelos no permitidos: {', '.join(sorted(unknown))}")
    for name in names:
        process(name)
