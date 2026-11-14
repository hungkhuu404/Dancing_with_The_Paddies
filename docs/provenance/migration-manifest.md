# Provenance migration — đợt 1

Ngày kiểm chứng: 14/11/2026, giờ Việt Nam. Actor: Codex. Human reviewer: chưa xác định. Phạm vi: viết chọn lọc tài liệu, không sao chép ứng dụng hoặc dữ liệu. Không nhập lịch sử Git hoặc quyền/phân công cũ.

## Revision được chọn

| Mốc nguồn Nasa_prep | Revision / kết luận |
| --- | --- |
| Checkout đang mở `quoc/real-data` | `6880147f1c8f06a624c64a9aaeadbfce2960a84d`; có untracked, không chọn làm baseline UI mới |
| Local `origin/main` | `608a248c99fc497b7719463ba4e3f74496fed454`; đã gồm PR #14, chưa gồm PR #15 |
| PR #15 head | `f9a6528403d7a8979d45a5865f98a69daa364c54`, branch `quoc/ui-refinement` |
| Main thực tế, merge PR #15 | **`963333cb68e773706d68a4251d83eeb4daab5bb8` — baseline kế thừa** |
| Tree của merge và PR head | Cùng `0ba62247ccea7305437adb68bc90da6347b8a95c`; có thể đọc blob từ PR head local mà không checkout/fetch nguồn |

Đã kiểm bằng `gh pr view`, GitHub API compare/commit và `git ls-remote`. [PR #15](https://github.com/hungkhuu404/Nasa_prep/pull/15) là MERGED vào `main`, lúc `2026-11-14T05:02:17Z`. API compare từ `608a248` tới `963333c` ghi ahead 3, behind 0: hai commit UI và merge commit. Đây là bằng chứng remote tại thời điểm kiểm, không phải cam kết main không đổi sau đó.

PR đổi 20 đường dẫn: tài liệu bản đồ codebase/review UI, web/UI/test và workflow; không đổi contract. Các module `chrome.js`, `motion.js`, `blockSummary.js`, `liquid.css` được thêm; `world/fieldSign.js` bị xóa. Không chuyển các file này trong đợt 1. Nội dung workflow/preview của PR không được nhập.

## Tài liệu nguồn tham khảo đã định danh

Blob đọc bằng `git ls-tree` từ PR head local. SHA-256 tính trên bytes của `git show <revision>:<path>`, không qua chuyển đổi newline. Tree đã xác nhận giống main được chọn. Không dùng file local untracked làm nguồn. Các tài liệu spec là tham chiếu cho kế hoạch, chưa chuyển nguyên văn.

| Nguồn tại Nasa_prep | Git blob | SHA-256 |
| --- | --- | --- |
| `AGENTS.md` | `5d175a3751cf5feadb798e9e50138e80b1d51050` | `5fd4f4e99eeeecc0dbd5d23d90a97984663555271e25ba0eed3c452f18ace900` |
| `docs/contracts.md` | `130f273ebf6350b850c77ed40eb9434c6945abb5` | `94e107dae7b7540d999da60587833ed27bbbe32a3f82b7e188959713739f4e35` |
| `docs/specs/spec_backend111126.md` | `44861b1eb56095c53549b4d6d936cb6d0a31d638` | `3dbf097d1dda05deac6bd8113bb4c9efd2bd542344123c79792e33afeebcf2c4` |
| `docs/specs/spec_uiux111126.md` | `a76bfcbba9ad7306da0f6fdd7579c02ae4cf3696` | `a4a19661ab50b09c34467d2ebc047ea812c2b065234b8c91ea508ec149c45756` |
| `docs/agent-instructions/Codebase_map.md` | `f696c1bf0ed42ece9f1cfecba7a8b021779e312d` | `759b5d6ad4b8c420cb2a3dd862e2e3d00a43360b64d779db397e14eaf0808f8e` |
| `docs/plans/ui-refinement_review.md` | `190bad63739b5b612bb534eb991c9beede18df3a` | `c98e779363fd3388581407b62c54437b652633c79a384451374cc6e82a60a577` |

## Đích và quyết định kế thừa

Baseline đích: repo [Dancing_with_The_Paddies](https://github.com/hungkhuu404/Dancing_with_The_Paddies), `main` tại `aa262910fd8c73877a88688a4ee7b8c6c09e57e4`. Các file mới chưa có destination commit. Hash đích ở [bảng đợt 1](batch-01-sha256.md).

| File đích | Căn cứ / cách xử lý |
| --- | --- |
| `AGENTS.md` | Viết mới, chọn nguyên tắc portable từ AGENTS nguồn; bỏ quyền/ngoại lệ lịch sử và yêu cầu layout cố định |
| `docs/README.md` | Viết mới từ inventory đích; hướng tới README/contract đã có, không tạo nguồn contract thứ hai |
| `docs/plans/migration-plan.md` | Biên tập bộ kế hoạch chuẩn bị của workspace, cập nhật checkout và revision main/PR #15; tham chiếu contract/spec/map của nguồn |
| `docs/plans/migration-batch-01.md` | Viết mới từ Git và thay đổi thực tế đợt này, không chép hội thoại hoặc đường dẫn máy |
| `docs/provenance/migration-manifest.md` | Viết mới từ bằng chứng Git/GitHub, source hashes và quyết định kế thừa |
| `docs/provenance/batch-01-sha256.md` | Sinh bảng SHA-256 tài liệu mới và snapshot các file baseline để kiểm bảo toàn |

Đây là tài liệu viết mới/tóm lược, không phải bản sao được gán lại tác giả hoặc giấy phép của toàn Nasa_prep. LICENSE MIT của repo đích giữ nguyên; chưa kết luận toàn source/data/asset của nguồn có thể cấp lại theo MIT. Trước đợt chuyển code/asset phải kiểm quyền và giữ notice upstream; license asset riêng không bao phủ mọi tài sản.

## Phần giữ nguyên và hoãn

- Giữ nguyên 14 file tracked từ baseline đích, gồm README, LICENSE, `docs/data-contract.md`, ba cấu hình text/ignore và tám `.gitkeep`.
- Không nhập `docs/contracts.md` bản chuẩn bị: contract đích đã là nguồn chuẩn, chi tiết timezone theo site ở đích cần được giữ.
- Không nhập bốn gói H* hoặc đề xuất 3D untracked của nguồn; không đọc payload của chúng. Không fetch, đổi branch, sửa tracked/untracked hoặc cấu hình repo cũ.
- Không chuyển app, data, asset, schema, fixture, dependency/lock, node_modules, cache, secret, private, CI/deploy hoặc script có tác dụng phụ.
- QA/test/build ghi trong review PR #15 là kết quả nguồn do nguồn báo; không tuyên bố đã tái chạy hoặc áp dụng cho đích.
