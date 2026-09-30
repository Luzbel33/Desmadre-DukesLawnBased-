"""Paint donor base-skin colors onto dancer bodies while retaining their boots and hair.

The donor GLBs are clean MakeHuman body references with matching body UVs and
vertex order. This keeps the club rig, eyes, hair, and accessories in place.
"""
import io
import json
import math
import pathlib
import random
import struct

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[3]
GAME = ROOT / "public/assets/chars/npc"
DONORS = ROOT / "assets/blender/mh/base-skin"
BODY_VERTICES = 14517
BOOT_TOP = {
    "lilith": ("lowerleg_l", 0.12),
    "coneja": ("foot_l", 0.10),
    "venus": ("lowerleg_l", -0.05),
    "raven": ("foot_l", 0.12),
    "emo": ("foot_l", 0.13),
}
TEXTURE_VERSION = 4
AREOLA_COLORS = {
    "lilith": (166, 75, 86, 211, 97, 111),
    "coneja": (105, 48, 53, 173, 78, 89),
    "venus": (139, 65, 65, 196, 96, 100),
    "raven": (132, 76, 69, 190, 111, 103),
    "emo": (166, 75, 86, 211, 97, 111),
}
PUBIC_COLORS = {
    "lilith": (56, 38, 37), "coneja": (46, 31, 28), "venus": (66, 40, 36),
    "raven": (51, 39, 33), "emo": (39, 31, 34),
}
HAIR_COLORS = {
    "lilith": (26, 20, 24), "coneja": (177, 153, 133), "venus": (166, 64, 112),
    "raven": (43, 34, 49), "emo": (24, 22, 27),
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


def long_hair_geometry(center, head_top, head_index, color_u=0.9):
    """Make a long cap and layered locks, weighted to the existing head bone."""
    positions, normals, uvs, joints, weights, faces = [], [], [], [], [], []
    rx = (head_top - center[1]) * 0.53
    ry = (head_top - center[1]) * 1.00
    rz = (head_top - center[1]) * 0.95
    cz = center[2] + 0.015
    phi_steps, rings = 64, 14

    def theta_limit(phi):
        # Keep the forehead and eyes clear; let the shell cover the sides and back.
        front = max(0.0, math.sin(phi))
        return 2.48 - 1.45 * front

    def add_vertex(p, n, uv):
        positions.append(p)
        normals.append(n)
        uvs.append(uv)
        joints.append([head_index, 0, 0, 0])
        weights.append([1.0, 0.0, 0.0, 0.0])
        return len(positions) - 1

    def quad(a, b, c, d):
        # Duplicate winding keeps thin locks visible from both sides.
        faces.extend((a, b, c, a, c, d, c, b, a, d, c, a))

    cols = phi_steps + 1
    for j in range(rings + 1):
        f = j / rings
        for i in range(cols):
            phi = 2 * math.pi * i / phi_steps
            theta = 0.12 + f * (theta_limit(phi) - 0.12)
            sn, cs = math.sin(theta), math.cos(theta)
            cp, sp = math.cos(phi), math.sin(phi)
            raw = [rx * sn * cp, ry * cs, rz * sn * sp]
            normal = [raw[0] / (rx * rx), raw[1] / (ry * ry), raw[2] / (rz * rz)]
            length = max(sum(x * x for x in normal) ** 0.5, 1e-8)
            normal = [x / length for x in normal]
            p = [center[0] + raw[0] + normal[0] * 0.024,
                 center[1] + raw[1] + normal[1] * 0.024,
                 cz + raw[2] + normal[2] * 0.024]
            add_vertex(p, normal, [0.82 + i / phi_steps * 0.17, 0.89 + f * 0.055])
    for j in range(rings):
        for i in range(phi_steps):
            a, b = j * cols + i, (j + 1) * cols + i
            quad(a, b, b + 1, a + 1)

    # Long, individually tapered locks around both sides and the back.
    # phi=pi/2 faces forward (+Z); keep all locks to the sides and back.
    phis = [0.0, 0.16, 0.34, 2.80, 2.98, 3.16, 3.34, 3.52,
            3.72, 3.96, 4.20, 4.46, 4.72, 4.98, 5.24, 5.50, 5.76, 6.00, 6.18]
    steps = 12
    for strand, phi in enumerate(phis):
        root_theta = theta_limit(phi) - 0.08
        cs, sn = math.cos(phi), math.sin(phi)
        root = [center[0] + rx * math.sin(root_theta) * cs,
                center[1] + ry * math.cos(root_theta),
                cz + rz * math.sin(root_theta) * sn]
        side = [-sn, 0.0, cs]
        rear = max(0.0, 1.0 - abs(phi - 1.5 * math.pi) / math.pi)
        length = 0.30 + 0.13 * rear
        width = 0.022 if strand % 3 else 0.028
        row_ids = []
        for j in range(steps + 1):
            t = j / steps
            wave = math.sin(t * 7 + strand * 1.7) * 0.009 * t
            y = root[1] - length * t
            cx = root[0] + side[0] * wave - 0.012 * t * cs
            czline = root[2] + side[2] * wave - (0.018 + 0.035 * t) * t
            taper = max(0.22, 1.0 - 0.76 * t)
            nx, nz = cs * 0.72, sn * 0.72 - 0.69
            nl = max((nx * nx + nz * nz) ** 0.5, 1e-8)
            normal = [nx / nl, 0.06, nz / nl]
            row = []
            for edge in (-1, 1):
                p = [cx + side[0] * width * taper * edge / 2,
                     y,
                     czline + side[2] * width * taper * edge / 2]
                u = 0.825 + (strand + (edge + 1) * 0.5) / len(phis) * 0.16
                v = 0.895 + 0.09 * t
                row.append(add_vertex(p, normal, [u, v]))
            row_ids.append(row)
        for j in range(steps):
            a, b = row_ids[j]
            c, d = row_ids[j + 1]
            quad(a, c, d, b)
    return positions, normals, uvs, joints, weights, faces


def append_accessor(doc, blob, rows, component_type, kind):
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[kind]
    fmt = {5123: "H", 5126: "f"}[component_type]
    blob.extend(bytes((-len(blob)) % 4))
    start = len(blob)
    for row in rows:
        values = row if width > 1 else [row[0]]
        blob.extend(struct.pack("<" + fmt * width, *values))
    view_index = len(doc["bufferViews"])
    doc["bufferViews"].append({"buffer": 0, "byteOffset": start, "byteLength": len(blob) - start})
    acc = {"bufferView": view_index, "componentType": component_type,
           "count": len(rows), "type": kind}
    if kind in ("VEC2", "VEC3"):
        acc["min"] = [min(row[i] for row in rows) for i in range(width)]
        acc["max"] = [max(row[i] for row in rows) for i in range(width)]
    doc["accessors"].append(acc)
    return len(doc["accessors"]) - 1


def replace_short_hair_with_long(doc, blob, mesh, positions, normals, uv, joints, weights, indices, head_center, head_top):
    # Existing MakeHuman helper-hair has facial wisps on these exports; remove
    # that geometry (the moustache) and add a deliberate long hairstyle.
    old_hair = {i for i, (u, v) in enumerate(uv) if u > 0.82 and v > 0.88}
    if not old_hair:
        raise ValueError("No se encontró la malla de pelo para reemplazar")
    kept = [i for i in range(0, len(indices) - 2, 3)
            if not all(vertex in old_hair for vertex in indices[i:i + 3])]
    clean_indices = [vertex for i in kept for vertex in indices[i:i + 3]]
    head_index = next((i for i, node in enumerate(doc["skins"][0]["joints"])
                       if doc["nodes"][node].get("name") == "head"), None)
    if head_index is None:
        raise ValueError("El rig no tiene hueso head")
    hp, hn, hu, hj, hw, hi = long_hair_geometry(head_center, head_top, head_index)
    offset = len(positions)
    all_rows = {
        "POSITION": positions + hp,
        "NORMAL": normals + hn,
        "TEXCOORD_0": uv + hu,
        "JOINTS_0": joints + hj,
        "WEIGHTS_0": weights + hw,
    }
    attrs = mesh["attributes"]
    for name, rows in all_rows.items():
        attrs[name] = append_accessor(doc, blob, rows, 5123 if name == "JOINTS_0" else 5126,
                                      "VEC4" if name in ("JOINTS_0", "WEIGHTS_0") else
                                      "VEC3" if name in ("POSITION", "NORMAL") else "VEC2")
    final_indices = clean_indices + [offset + i for i in hi]
    mesh["indices"] = append_accessor(doc, blob, [[i] for i in final_indices], 5123, "SCALAR")
    return len(old_hair), len(hp)


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


def paint_radial(image, center, radius, color, peak_alpha):
    """Soft, UV-space pigmentation with no hard decal edge."""
    pixels = image.load()
    cx, cy = center
    rx, ry = radius
    x0, x1 = max(0, int(cx - rx - 2)), min(image.width - 1, int(cx + rx + 2))
    y0, y1 = max(0, int(cy - ry - 2)), min(image.height - 1, int(cy + ry + 2))
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            r = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            if r >= 1.18:
                continue
            edge = max(0.0, min(1.0, (1.18 - r) / 0.42))
            alpha = peak_alpha * edge * edge * (3 - 2 * edge)
            old = pixels[x, y]
            pixels[x, y] = tuple(round(old[i] * (1 - alpha) + color[i] * alpha) for i in range(3))


def add_anatomical_details(image, name):
    # MakeHuman's shared body UV layout places both areolae here for this cast.
    outer, nipple = AREOLA_COLORS[name][:3], AREOLA_COLORS[name][3:]
    for u in (0.32685, 0.43420):
        center = (u * image.width, 0.3900 * image.height)
        paint_radial(image, center, (9, 10), outer, 0.84)
        paint_radial(image, center, (3, 4), nipple, 1.0)

    # A small, tapered patch of short natural hair, placed on the front pelvis.
    from PIL import ImageChops
    scale = 4
    mask = Image.new("L", (image.width * scale, image.height * scale), 0)
    draw = ImageDraw.Draw(mask)
    cx, cy = round(0.380 * image.width * scale), round(0.670 * image.height * scale)
    draw.polygon([(cx, cy - 23 * scale), (cx - 24 * scale, cy + 18 * scale),
                  (cx + 24 * scale, cy + 18 * scale)], fill=188)
    mask = mask.resize(image.size, Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(1.1))
    color = Image.new("RGB", image.size, PUBIC_COLORS[name])
    image.paste(color, mask=mask)

    # Fine curls keep the patch textured instead of reading as painted underwear.
    rng = random.Random(31)
    curls = Image.new("RGBA", image.size, (0, 0, 0, 0))
    cd = ImageDraw.Draw(curls)
    base_x, base_y = 0.380 * image.width, 0.670 * image.height
    for _ in range(42):
        x = base_x + rng.uniform(-15, 15)
        y = base_y + rng.uniform(-7, 13)
        if abs(x - base_x) > 23 * (y - (base_y - 23)) / 41:
            continue
        r = rng.uniform(1.2, 2.4)
        shade = tuple(max(0, c - rng.randrange(0, 17)) for c in PUBIC_COLORS[name]) + (210,)
        cd.arc((x-r, y-r, x+r, y+r), rng.randrange(0, 180), rng.randrange(190, 360), fill=shade, width=1)
    image.paste(curls, (0, 0), curls)


def recolor_hair_atlas(image, name):
    x0, y0, width, height = 1680, round((0.875 + 0.005) * image.height), 360, 230
    base = HAIR_COLORS[name]
    draw = ImageDraw.Draw(image)
    for x in range(width):
        strand = 0.76 + 0.16 * (0.5 + 0.5 * __import__("math").sin(x * 0.11))
        highlight = 0.15 if x % 29 in (13, 14, 15) else 0.0
        for y in range(height):
            root = 0.72 + 0.24 * y / max(1, height - 1)
            factor = min(1.0, strand * root + highlight)
            draw.point((x0 + x, y0 + y), fill=tuple(round(c * factor) for c in base))


def process(name):
    target, donor = GAME / f"{name}.glb", DONORS / f"{name}.glb"
    chunks, doc, bin_chunk = read_glb(target)
    if doc.get("extras", {}).get("baseSkinTextureVersion") == TEXTURE_VERSION:
        print(f"{name}: ya tiene la piel base limpia")
        return
    donor_chunks, donor_doc, donor_bin = read_glb(donor)
    blob = bytearray(chunks[bin_chunk][1])
    donor_blob = donor_chunks[donor_bin][1]
    mesh = doc["meshes"][0]["primitives"][0]
    base = donor_doc["meshes"][0]["primitives"][0]
    pos = accessor(doc, blob, mesh["attributes"]["POSITION"])
    normals = accessor(doc, blob, mesh["attributes"]["NORMAL"])
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
    bones = joint_positions(doc, doc["skins"][0])
    old_hair, new_hair = replace_short_hair_with_long(
        doc, blob, mesh, pos, normals, uv, joints, weights, indices,
        bones["head"], bones["head_end"][1])
    joint_names = [doc["nodes"][i].get("name", "") for i in doc["skins"][0]["joints"]]
    dominant = [joint_names[ids[max(range(4), key=lambda i: ws[i])]] for ids, ws in zip(joints, weights)]
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
        # Preserve the original boot textures and their small geometry offsets.
        if min(pos[i][1] for i in tri) <= boot_top + 0.025:
            preserve_draw.polygon(polygon, fill=255)
            preserved += 1
            continue
        paint_triangle(color_draw, skin_draw, [uv[i] for i in tri], [colors[i] for i in tri], color.width, color.height)
        selected += 1

    add_anatomical_details(color, name)
    recolor_hair_atlas(color, name)

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
    doc.setdefault("extras", {})["baseSkinTextureVersion"] = TEXTURE_VERSION
    chunks[bin_chunk][1] = bytes(blob)
    json_chunk = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_chunk += b" " * ((-len(json_chunk)) % 4)
    binary_chunk = chunks[bin_chunk][1]
    binary_chunk += b"\0" * ((-len(binary_chunk)) % 4)
    payload = bytearray()
    payload.extend(struct.pack("<II", len(json_chunk), 0x4E4F534A)); payload.extend(json_chunk)
    payload.extend(struct.pack("<II", len(binary_chunk), 0x004E4942)); payload.extend(binary_chunk)
    target.write_bytes(b"glTF" + struct.pack("<II", 2, 12 + len(payload)) + payload)
    print(f"{name}: {selected} triángulos de piel; {preserved} de botas; pelo reemplazado ({old_hair} viejos, {new_hair} nuevos); base y={boot_top:.3f}")


if __name__ == "__main__":
    import sys
    names = sys.argv[1:] or list(BOOT_TOP)
    unknown = set(names) - BOOT_TOP.keys()
    if unknown:
        raise SystemExit(f"Modelos no permitidos: {', '.join(sorted(unknown))}")
    for name in names:
        process(name)
